import { createRouter } from "./middleware";
import { protectedQuery } from "./accountProcedure";
import { z } from "zod";
import { calendarDate } from "../contracts/shared";
import { peerBusyForDay, lockPlanning, assertSharedSlot } from "./sharing";
import { getDb } from "./queries/connection";
import { tasks, scheduledBlocks } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { visible, owned } from "./lib/access";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
export const sharingRouter = createRouter({
  busy: protectedQuery.input(z.object({ day: calendarDate })).query(({ input }) => peerBusyForDay(input.day)),
  reschedule: protectedQuery.input(z.object({ taskId: z.string().min(1).max(36), start: z.date(), end: z.date(), expectedUpdatedAt: z.date().optional() })).mutation(async ({ input }) => getDb().transaction(async tx => {
    await lockPlanning(tx);
    const [task] = await tx.select().from(tasks).where(and(visible(tasks), eq(tasks.id, input.taskId), eq(tasks.isDeleted, false))).for("update");
    if (!task || !task.workspaceId) throw new TRPCError({ code: "NOT_FOUND", message: "Общая задача не найдена" });
    if (task.status === "done") throw new TRPCError({ code: "BAD_REQUEST", message: "Задача уже завершена" });
    if (input.expectedUpdatedAt && input.expectedUpdatedAt.getTime() !== task.updatedAt.getTime()) throw new TRPCError({ code: "CONFLICT", message: "Задача уже изменена. Обновите её." });
    if (input.end.getTime() - input.start.getTime() > 86400000 || input.start < new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "Выберите будущее время длительностью не более суток" });
    const old = await tx.select().from(scheduledBlocks).where(and(eq(scheduledBlocks.taskId, task.id), eq(scheduledBlocks.isDeleted, false)));
    await assertSharedSlot(tx, [task.id], input.start, input.end, old.map(row => row.id));
    for (const row of old) await tx.update(scheduledBlocks).set({ isDeleted: true, updatedAt: new Date() }).where(eq(scheduledBlocks.id, row.id));
    const id = randomUUID();
    await tx.insert(scheduledBlocks).values(owned({ id, taskId: task.id, workspaceId: task.workspaceId, start: input.start, end: input.end }));
    await tx.update(tasks).set({ plannedStart: input.start, plannedEnd: input.end, updatedAt: new Date() }).where(eq(tasks.id, task.id));
    return { id };
  })),
});
