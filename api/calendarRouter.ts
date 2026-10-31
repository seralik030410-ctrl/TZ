import { privateScope } from "./lib/access";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { protectedQuery } from "./accountProcedure";
import { getDb } from "./queries/connection";
import { scheduleItems, scheduleExceptions } from "../db/schema";
import { scheduleSchema, exceptionSchema } from "../contracts/schedule";
import { createOnce, existingOwned } from "./moduleStore";
import { lockPlanning } from "./sharing";
export const calendarRouter = createRouter({
  saveEvent: protectedQuery.input(scheduleSchema.safeExtend({ onDate: z.iso.date().nullable().default(null), mode: z.enum(["create", "update"]).default("create") })).mutation(async ({ input }) => {
    const { mode, ...row } = input;
    await getDb().transaction(async tx => {
      await lockPlanning(tx);
      if (mode === "create") await createOnce(scheduleItems, row, tx);
      else await tx.update(scheduleItems).set({ ...row, updatedAt: new Date() }).where(and(privateScope(scheduleItems), eq(scheduleItems.id, row.id), eq(scheduleItems.isDeleted, false)));
    });
    return { id: row.id };
  }),
  saveException: protectedQuery.input(exceptionSchema).mutation(async ({ input }) => {
    await getDb().transaction(async tx => {
      await lockPlanning(tx);
      if (await existingOwned(scheduleExceptions, input.id, tx)) return;
      const [event] = await tx.select().from(scheduleItems).where(and(privateScope(scheduleItems), and(eq(scheduleItems.id, input.itemId), eq(scheduleItems.isDeleted, false)))).for("update");
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Событие не найдено" });
      const [existing] = await tx.select().from(scheduleExceptions).where(and(privateScope(scheduleExceptions), and(eq(scheduleExceptions.itemId, input.itemId), eq(scheduleExceptions.date, input.date), eq(scheduleExceptions.isDeleted, false))));
      if (existing && existing.id !== input.id) throw new TRPCError({ code: "CONFLICT", message: "Для этой даты уже есть исключение. Сначала удалите прежнее." });
      await createOnce(scheduleExceptions, input, tx);
    }); return { id: input.id };
  }),
  removeException: protectedQuery.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    await getDb().transaction(async tx => {
      await lockPlanning(tx);
      const [exception] = await tx.select().from(scheduleExceptions).where(and(privateScope(scheduleExceptions), eq(scheduleExceptions.id, input.id)));
      if (!exception) return;
      const [event] = await tx.select().from(scheduleItems).where(and(privateScope(scheduleItems), eq(scheduleItems.id, exception.itemId)));
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Событие не найдено" });
      await tx.update(scheduleExceptions).set({ isDeleted: true, updatedAt: new Date() }).where(and(privateScope(scheduleExceptions), eq(scheduleExceptions.id, input.id)));
    }); return { ok: true };
  }),
});
