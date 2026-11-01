import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import superjson from "superjson";
import { createRouter } from "./middleware";
import { protectedQuery } from "./accountProcedure";
import { getDb } from "./queries/connection";
import { tasks, projects, scheduledBlocks, settings, taskArchiveBatches, scheduleItems, scheduleExceptions } from "../db/schema";
import { privateScope, visible } from "./lib/access";
import { currentSettingsId, currentUserId } from "./lib/accountContext";
import { lockPlanning } from "./sharing";
import { selectArchive } from "../contracts/taskArchive";
import { dayInZone, zonedDateAt } from "../contracts/shared";
import { scheduleForDay } from "../contracts/schedule";
import { restoreIntervals } from "../contracts/plannerState";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Task = typeof tasks.$inferSelect;
type Block = typeof scheduledBlocks.$inferSelect;
type Snapshot = { tasks: Task[]; blocks: Block[] };
const hash = (value: unknown) => createHash("sha256").update(superjson.stringify(value)).digest("hex");
const input = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), timezone: z.literal("Asia/Dushanbe") });
async function state(tx: Tx) {
  const taskRows = await tx.select().from(tasks).where(visible(tasks)).orderBy(tasks.id);
  const blockRows = await tx.select().from(scheduledBlocks).where(visible(scheduledBlocks)).orderBy(scheduledBlocks.id);
  const projectRows = await tx.select().from(projects).where(visible(projects)).orderBy(projects.id);
  const [prefs] = await tx.select().from(settings).where(and(privateScope(settings), eq(settings.id, currentSettingsId())));
  if (!prefs) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Сначала откройте ежедневник" });
  return { taskRows, blockRows, projectRows, prefs };
}
function plan(s: Awaited<ReturnType<typeof state>>, month: string) {
  const selected = selectArchive(s.taskRows, s.projectRows, currentUserId(), `${month}-01`);
  const ids = new Set(selected.taskIds);
  const blocks = s.blockRows.filter(b => ids.has(b.taskId) && !b.isDeleted && b.status !== "done");
  for (const b of blocks) if (b.ownerId !== currentUserId() || b.workspaceId) selected.conflicts.push(b.id);
  return { ...selected, personalCount: ids.size, blockCount: blocks.length, revision: hash(s), blocks };
}
export const taskArchiveRouter = createRouter({
  preview: protectedQuery.input(input).query(({ input }) => getDb().transaction(async tx => {
    const s = await state(tx);
    if (`${input.month}-01` > dayInZone(new Date(), input.timezone)) throw new TRPCError({ code: "BAD_REQUEST", message: "Нельзя начинать будущий месяц" });
    const p = plan(s, input.month);
    return { revision: p.revision, personalCount: p.personalCount, sharedPreservedCount: p.sharedPreservedCount, routinesPreservedCount: p.routinesPreservedCount, blockCount: p.blockCount, conflicts: p.conflicts };
  })),
  list: protectedQuery.query(async () => (await getDb().select({ id: taskArchiveBatches.id, month: taskArchiveBatches.month, createdAt: taskArchiveBatches.createdAt, restoredAt: taskArchiveBatches.restoredAt }).from(taskArchiveBatches).where(privateScope(taskArchiveBatches))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
  commit: protectedQuery.input(input.extend({ operationId: z.string().uuid(), revision: z.string().length(64) })).mutation(({ input }) => getDb().transaction(async tx => {
    await lockPlanning(tx);
    const [prior] = await tx.select().from(taskArchiveBatches).where(eq(taskArchiveBatches.id, input.operationId));
    if (prior) {
      if (prior.ownerId !== currentUserId()) throw new TRPCError({ code: "NOT_FOUND" });
      return { batchId: prior.id };
    }
    const s = await state(tx), p = plan(s, input.month);
    if (`${input.month}-01` > dayInZone(new Date(), input.timezone) || p.revision !== input.revision) throw new TRPCError({ code: "CONFLICT", message: "Данные изменились. Обновите предпросмотр архива." });
    if (p.conflicts.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Есть связи с общими задачами. Архив не применён." });
    const snapshot: Snapshot = { tasks: s.taskRows.filter(t => p.taskIds.includes(t.id)), blocks: p.blocks };
    if (p.taskIds.length) await tx.update(tasks).set({ isDeleted: true, updatedAt: new Date() }).where(and(privateScope(tasks), inArray(tasks.id, p.taskIds)));
    if (p.blocks.length) await tx.update(scheduledBlocks).set({ isDeleted: true, updatedAt: new Date() }).where(and(privateScope(scheduledBlocks), inArray(scheduledBlocks.id, p.blocks.map(b => b.id))));
    const after = await state(tx);
    const changed = { tasks: after.taskRows.filter(t => p.taskIds.includes(t.id)), blocks: after.blockRows.filter(b => p.blocks.some(row => row.id === b.id)) };
    await tx.insert(taskArchiveBatches).values({ id: input.operationId, ownerId: currentUserId(), month: input.month, snapshot: superjson.stringify(snapshot), revision: hash(changed) });
    await tx.update(settings).set({ taskEpoch: sql`${settings.taskEpoch} + 1`, updatedAt: new Date() }).where(and(privateScope(settings), eq(settings.id, currentSettingsId())));
    return { batchId: input.operationId };
  })),
  restore: protectedQuery.input(z.object({ batchId: z.string().uuid() })).mutation(({ input }) => getDb().transaction(async tx => {
    await lockPlanning(tx);
    const [batch] = await tx.select().from(taskArchiveBatches).where(and(privateScope(taskArchiveBatches), eq(taskArchiveBatches.id, input.batchId))).for("update");
    if (!batch) throw new TRPCError({ code: "NOT_FOUND" });
    if (batch.restoredAt) return { ok: true };
    const snapshot = superjson.parse<Snapshot>(batch.snapshot), s = await state(tx);
    const ids = snapshot.tasks.map(t => t.id), blockIds = snapshot.blocks.map(b => b.id);
    if (hash({ tasks: s.taskRows.filter(t => ids.includes(t.id)), blocks: s.blockRows.filter(b => blockIds.includes(b.id)) }) !== batch.revision) throw new TRPCError({ code: "CONFLICT", message: "Записи архива изменились. Восстановление остановлено." });
    const activeIds = new Set([...s.taskRows.filter(t => !t.isDeleted).map(t => t.id), ...ids]);
    if (snapshot.tasks.some(t => t.parentId && !activeIds.has(t.parentId) || t.dependsOn && !activeIds.has(t.dependsOn) || t.projectId && !s.projectRows.some(p => p.id === t.projectId && !p.isDeleted))) throw new TRPCError({ code: "CONFLICT", message: "Связанная задача или проект больше недоступны" });
    const events = await tx.select().from(scheduleItems).where(and(privateScope(scheduleItems), eq(scheduleItems.isDeleted, false)));
    const exceptions = await tx.select().from(scheduleExceptions).where(and(privateScope(scheduleExceptions), eq(scheduleExceptions.isDeleted, false)));
    for (const b of restoreIntervals(snapshot.tasks, snapshot.blocks)) {
      const overlaps = s.blockRows.some(other => !other.isDeleted && !blockIds.includes(other.id) && other.status !== "done" && other.start < b.end && other.end > b.start);
      const day = dayInZone(b.start, s.prefs.timezone);
      const fixed = scheduleForDay(events, exceptions, day).some(e => zonedDateAt(day, e.startMin, s.prefs.timezone) < b.end && zonedDateAt(day, e.endMin, s.prefs.timezone) > b.start);
      const direct = s.taskRows.some(t => !t.isDeleted && !ids.includes(t.id) && t.plannedStart && t.plannedEnd && t.plannedStart < b.end && t.plannedEnd > b.start);
      if (overlaps || fixed || direct) throw new TRPCError({ code: "CONFLICT", message: "Время архивного блока уже занято. Освободите его перед восстановлением." });
    }
    if (ids.length) await tx.update(tasks).set({ isDeleted: false, updatedAt: new Date() }).where(and(privateScope(tasks), inArray(tasks.id, ids)));
    if (blockIds.length) await tx.update(scheduledBlocks).set({ isDeleted: false, updatedAt: new Date() }).where(and(privateScope(scheduledBlocks), inArray(scheduledBlocks.id, blockIds)));
    await tx.update(taskArchiveBatches).set({ restoredAt: new Date() }).where(eq(taskArchiveBatches.id, batch.id));
    await tx.update(settings).set({ taskEpoch: sql`${settings.taskEpoch} + 1`, updatedAt: new Date() }).where(and(privateScope(settings), eq(settings.id, currentSettingsId())));
    return { ok: true };
  })),
});
