import { privateScope, visible, owned } from "./lib/access";
import { currentSettingsId } from "./lib/accountContext";
import { z } from "zod";
import { and, eq, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { protectedQuery } from "./accountProcedure";
import { getDb } from "./queries/connection";
import { materializeRoutines, occurrenceId } from "./queries/routines";
import { taskTemplates, tasks, dayClosures, settings, scheduledBlocks, timeLogs } from "../db/schema";
import { templateSchema } from "../contracts/routines";
import { addCalendarDays, calendarDate, dayInZone } from "../contracts/shared";

import { createOnce, existingOwned } from "./moduleStore";
import { lockPlanning } from "./sharing";

export const routinesRouter = createRouter({
  list: protectedQuery.query(async () => ({ templates: await getDb().select().from(taskTemplates).where(and(privateScope(taskTemplates), eq(taskTemplates.isDeleted, false))), closures: await getDb().select().from(dayClosures).where(privateScope(dayClosures)) })),
  save: protectedQuery.input(templateSchema).mutation(async ({ input }) => {
    if (await existingOwned(taskTemplates, input.id)) await getDb().update(taskTemplates).set({ ...input, updatedAt: new Date() }).where(and(privateScope(taskTemplates), eq(taskTemplates.id, input.id)));
    else await createOnce(taskTemplates, input);
    await materializeRoutines(); return { id: input.id };
  }),
  remove: protectedQuery.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    await getDb().update(taskTemplates).set({ isDeleted: true, updatedAt: new Date() }).where(and(privateScope(taskTemplates), eq(taskTemplates.id, input.id))); return { ok: true };
  }),
  useTemplate: protectedQuery.input(z.object({ id: z.string().uuid(), operationId: z.string().uuid(), day: calendarDate })).mutation(async ({ input }) => {
    const [template] = await getDb().select().from(taskTemplates).where(and(privateScope(taskTemplates), and(eq(taskTemplates.id, input.id), eq(taskTemplates.isDeleted, false))));
    if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Шаблон не найден" });
    const id = occurrenceId(input.id, input.operationId);
    await createOnce(tasks, { id, title: template.title, estimateMin: template.estimateMin, due: input.day }); return { id };
  }),
  closeDay: protectedQuery.input(z.object({ day: calendarDate, note: z.string().max(5000).default(""), moveIds: z.array(z.string().max(36)).max(1000), targetDay: calendarDate })).mutation(async ({ input }) => {
    await getDb().transaction(async tx => {
      await lockPlanning(tx);
      const [prefs] = await tx.select().from(settings).where(and(privateScope(settings), eq(settings.id, currentSettingsId()))).for("update");
      const today = dayInZone(new Date(), prefs?.timezone);
      if (input.day !== today || input.targetDay <= today) throw new TRPCError({ code: "BAD_REQUEST", message: "Закрыть можно сегодня, переносить — на будущую дату" });
      const [closed] = await tx.select().from(dayClosures).where(and(privateScope(dayClosures), eq(dayClosures.day, today))); if (closed) return;
      const all = await tx.select().from(tasks).where(and(visible(tasks), eq(tasks.isDeleted, false))).for("update");
      const selected = all.filter(t => input.moveIds.includes(t.id));
      if (selected.length !== new Set(input.moveIds).size || selected.some(t => t.status === "done" || !t.due || t.due > today)) throw new TRPCError({ code: "CONFLICT", message: "Задачи изменились. Обновите итог дня" });
      for (const task of selected) {
        if (task.recurrence) continue; // Tomorrow has its own occurrence; today's missed habit remains in history.
        await tx.update(tasks).set({ due: input.targetDay, plannedStart: null, plannedEnd: null, updatedAt: new Date() }).where(and(visible(tasks), eq(tasks.id, task.id)));
        await tx.update(scheduledBlocks).set({ isDeleted: true, updatedAt: new Date() }).where(and(visible(scheduledBlocks), and(eq(scheduledBlocks.taskId, task.id), eq(scheduledBlocks.status, "planned"), lte(scheduledBlocks.end, new Date()))));
      }
      const completed = all.filter(t => t.completedAt && dayInZone(t.completedAt, prefs?.timezone) === today).length;
      const logs = await tx.select().from(timeLogs).where(and(privateScope(timeLogs), eq(timeLogs.isDeleted, false)));
      if (logs.some(log => !log.end)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Завершите текущую фокус-сессию перед закрытием дня" });
      const focus = logs.filter(log => dayInZone(log.start, prefs?.timezone) === today).reduce((sum, log) => sum + log.minutes, 0);
      await tx.insert(dayClosures).values(owned({ day: today, note: `Завершено задач: ${completed}. Фокус: ${focus} мин.\n\n${input.note}`, movedIds: JSON.stringify(selected.filter(t => !t.recurrence).map(t => t.id)) }));
    }); return { ok: true, tomorrow: addCalendarDays(input.day, 1) };
  }),
});
