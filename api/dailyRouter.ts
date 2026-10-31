import { privateScope, visible, owned } from "./lib/access";
import { currentSettingsId } from "./lib/accountContext";
import { scheduleForDay } from "../contracts/schedule";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { protectedQuery } from "./accountProcedure";
import { getDb } from "./queries/connection";
import { tasks, settings, scheduleItems, scheduledBlocks, scheduleExceptions, reflowLog } from "../db/schema";
import { buildDailyPlan } from "../contracts/dailyPlan";
import { calendarDate, dayInZone, minutesInZone, zonedDateAt } from "../contracts/shared";

import { existingOwned } from "./moduleStore";
import { lockPlanning, assertSharedSlot } from "./sharing";

type DB = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
const planInput = z.object({ day: calendarDate, startMin: z.number().int().min(0).max(1439), reservePercent: z.number().int().min(0).max(50).default(20), taskIds: z.array(z.string().min(1).max(36)).max(500), mode: z.enum(["append", "reflow"]).default("append") });
async function preview(db: DB | Tx, input: z.infer<typeof planInput>) {
  const [prefs] = await db.select().from(settings).where(and(privateScope(settings), eq(settings.id, currentSettingsId())));
  if (!prefs) throw new TRPCError({ code: "BAD_REQUEST", message: "Сначала откройте ежедневник" });
  const [taskRows, schedule, exceptions, blocks] = await Promise.all([db.select().from(tasks).where(and(visible(tasks), eq(tasks.isDeleted, false))), db.select().from(scheduleItems).where(and(privateScope(scheduleItems), eq(scheduleItems.isDeleted, false))), db.select().from(scheduleExceptions).where(and(privateScope(scheduleExceptions), and(eq(scheduleExceptions.isDeleted, false), eq(scheduleExceptions.date, input.day)))), db.select().from(scheduledBlocks).where(and(visible(scheduledBlocks), eq(scheduledBlocks.isDeleted, false)))]);
  const zone = prefs.timezone; const today = dayInZone(new Date(), zone);
  if (input.day < today) throw new TRPCError({ code: "BAD_REQUEST", message: "Нельзя планировать прошедший день" });
  const events = scheduleForDay(schedule, exceptions, input.day).map(s => ({ id: s.id, startMin: s.startMin, endMin: s.endMin, fixed: true }));
  const dayBlocks = blocks.filter(b => dayInZone(b.start, zone) <= input.day && dayInZone(b.end, zone) >= input.day);
  const selected = new Set(input.taskIds);
  if (taskRows.filter(t => selected.has(t.id)).length !== selected.size) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена" });
  const replacing = input.mode === "reflow" ? dayBlocks.filter(b => selected.has(b.taskId) && b.status === "planned" && (input.day > today || b.start.getTime() > Date.now()) && taskRows.find(t => t.id === b.taskId)?.flexibility !== "fixed") : [];
  const preserved = dayBlocks.filter(b => !replacing.some(r => r.id === b.id));
  events.push(...preserved.map(b => ({ id: b.id, startMin: dayInZone(b.start, zone) < input.day ? 0 : minutesInZone(b.start, zone), endMin: dayInZone(b.end, zone) > input.day ? 1440 : minutesInZone(b.end, zone), fixed: true })));
  const allTasks = taskRows.filter(t => selected.has(t.id) || t.status === "done");
  const result = buildDailyPlan({ ...input, startMin: Math.max(input.startMin, prefs.workStartMin), endMin: prefs.workEndMin, tasks: allTasks, events, alreadyPlanned: preserved.map(b => b.taskId) });
  const revision = createHash("sha256").update(JSON.stringify({ input, prefs, taskRows, schedule, exceptions, blocks })).digest("hex");
  return { ...result, revision, timezone: zone, replacingIds: replacing.map(b => b.id), taskWorkspaces: Object.fromEntries(taskRows.map(t => [t.id, t.workspaceId])) };
}
export const dailyRouter = createRouter({
  preview: protectedQuery.input(planInput).query(({ input }) => preview(getDb(), input)),
  commitPlan: protectedQuery.input(planInput.extend({ operationId: z.string().uuid(), revision: z.string().length(64) })).mutation(async ({ input }) => {
    return getDb().transaction(async tx => {
      await lockPlanning(tx);
      await tx.select().from(settings).where(and(privateScope(settings), eq(settings.id, currentSettingsId()))).for("update");
      const existing = await existingOwned(reflowLog, input.operationId, tx);
      if (existing) return { id: existing.id };
      const clean = planInput.parse(input); const plan = await preview(tx, clean);
      if (plan.revision !== input.revision) throw new TRPCError({ code: "CONFLICT", message: "Данные изменились. Обновите предпросмотр перед применением." });
      if (input.day === dayInZone(new Date(), plan.timezone) && input.startMin < minutesInZone(new Date(), plan.timezone)) throw new TRPCError({ code: "CONFLICT", message: "Время начала уже прошло. Обновите предпросмотр." });
      const ids: string[] = []; const now = new Date();
      for (const id of plan.replacingIds) await tx.update(scheduledBlocks).set({ isDeleted: true, updatedAt: now }).where(and(visible(scheduledBlocks), eq(scheduledBlocks.id, id)));
      for (const block of plan.blocks) {
        const id = crypto.randomUUID(); ids.push(id);
        await assertSharedSlot(tx, [block.taskId], zonedDateAt(block.day, block.startMin, plan.timezone), zonedDateAt(block.day, block.endMin, plan.timezone), plan.replacingIds);
        await tx.insert(scheduledBlocks).values(owned({ id, taskId: block.taskId, workspaceId: plan.taskWorkspaces[block.taskId] ?? null, start: zonedDateAt(block.day, block.startMin, plan.timezone), end: zonedDateAt(block.day, block.endMin, plan.timezone), updatedAt: now }));
      }
      await tx.insert(reflowLog).values(owned({ id: input.operationId, reason: "daily-plan", changes: JSON.stringify({ ids, replacing: plan.replacingIds, created: Math.floor(now.getTime() / 1000) }), applied: true }));
      return { id: input.operationId };
    });
  }),
  undo: protectedQuery.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    await getDb().transaction(async tx => {
      await lockPlanning(tx);
      const [log] = await tx.select().from(reflowLog).where(and(privateScope(reflowLog), eq(reflowLog.id, input.id))).for("update");
      if (!log || !log.applied || log.reason !== "daily-plan") return;
      const { ids, replacing = [], created } = JSON.parse(log.changes) as { ids: string[]; replacing?: string[]; created: number };
      for (const id of ids) {
        const [block] = await tx.select().from(scheduledBlocks).where(and(visible(scheduledBlocks), eq(scheduledBlocks.id, id))).for("update");
        if (block && !block.isDeleted && (block.status !== "planned" || Math.floor(block.updatedAt.getTime() / 1000) !== created)) throw new TRPCError({ code: "CONFLICT", message: "Один из блоков уже изменён. Отмена всего плана недоступна." });
      }
      for (const id of ids) await tx.update(scheduledBlocks).set({ isDeleted: true, updatedAt: new Date() }).where(and(visible(scheduledBlocks), eq(scheduledBlocks.id, id)));
      for (const id of replacing) {
        const [block] = await tx.select().from(scheduledBlocks).where(and(visible(scheduledBlocks), eq(scheduledBlocks.id, id))).for("update");
        if (block?.status === "planned") await assertSharedSlot(tx, [block.taskId], block.start, block.end, replacing);
        await tx.update(scheduledBlocks).set({ isDeleted: false, updatedAt: new Date() }).where(and(visible(scheduledBlocks), eq(scheduledBlocks.id, id)));
      }
      await tx.update(reflowLog).set({ applied: false, updatedAt: new Date() }).where(and(privateScope(reflowLog), eq(reflowLog.id, input.id)));
    }); return { ok: true };
  }),
});
