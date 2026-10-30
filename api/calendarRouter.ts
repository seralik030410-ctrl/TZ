import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { protectedQuery } from "./plannerRouter";
import { getDb } from "./queries/connection";
import { scheduleItems, scheduleExceptions } from "../db/schema";
import { scheduleSchema, exceptionSchema } from "../contracts/schedule";
export const calendarRouter = createRouter({
  saveEvent: protectedQuery.input(scheduleSchema.safeExtend({ onDate: z.iso.date().nullable().default(null), mode: z.enum(["create", "update"]).default("create") })).mutation(async ({ input }) => {
    const { mode, ...row } = input;
    if (mode === "create") await getDb().insert(scheduleItems).values(row).onDuplicateKeyUpdate({ set: { id: row.id } });
    else await getDb().update(scheduleItems).set({ ...row, updatedAt: new Date() }).where(and(eq(scheduleItems.id, row.id), eq(scheduleItems.isDeleted, false)));
    return { id: row.id };
  }),
  saveException: protectedQuery.input(exceptionSchema).mutation(async ({ input }) => {
    await getDb().transaction(async tx => {
      const [event] = await tx.select().from(scheduleItems).where(and(eq(scheduleItems.id, input.itemId), eq(scheduleItems.isDeleted, false))).for("update");
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Событие не найдено" });
      const [existing] = await tx.select().from(scheduleExceptions).where(and(eq(scheduleExceptions.itemId, input.itemId), eq(scheduleExceptions.date, input.date), eq(scheduleExceptions.isDeleted, false)));
      if (existing && existing.id !== input.id) throw new TRPCError({ code: "CONFLICT", message: "Для этой даты уже есть исключение. Сначала удалите прежнее." });
      await tx.insert(scheduleExceptions).values(input).onDuplicateKeyUpdate({ set: { id: input.id } });
    }); return { id: input.id };
  }),
  removeException: protectedQuery.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => { await getDb().update(scheduleExceptions).set({ isDeleted: true, updatedAt: new Date() }).where(eq(scheduleExceptions.id, input.id)); return { ok: true }; }),
});
