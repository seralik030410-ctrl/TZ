import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { protectedQuery } from "./plannerRouter";
import { getDb } from "./queries/connection";
import { debts, debtPayments } from "../db/debts";
import { transactions } from "../db/schema";
import { and } from "drizzle-orm";
import { debtsWriteSchema, debtPaymentSchema, debtRemaining } from "../contracts/debts";
import { createOnce, requireActive } from "./moduleStore";
export const debtsRouter = createRouter({
  list: protectedQuery.query(async () => {
    const db = getDb(); const [debtRows, paymentRows] = await Promise.all([db.select().from(debts).where(eq(debts.isDeleted, false)), db.select().from(debtPayments).where(eq(debtPayments.isDeleted, false))]);
    const active = debtRows;
    return { debts: active, payments: paymentRows.filter(p => active.some(d => d.id === p.debtId)) };
  }),
  save: protectedQuery.input(z.object({ record: debtsWriteSchema, mode: z.enum(["create", "update"]).default("create"), recordExpense: z.boolean().default(false) })).mutation(async ({ input }) => {
    const { record, mode } = input; const db = getDb();
    if (record.entity === "debts") {
      const [existing] = await db.select().from(debts).where(eq(debts.id, record.data.id)).limit(1);
      if (mode === "create" && existing) return { id: record.data.id };
      if (mode === "update") { await requireActive(debts, record.data.id); await db.update(debts).set({ ...record.data, updatedAt: new Date() }).where(eq(debts.id, record.data.id)); }
      else await createOnce(debts, record.data);
    } else {
      const payment = record.data as typeof debtPaymentSchema._output;
      await db.transaction(async tx => {
        const [debt] = await tx.select().from(debts).where(and(eq(debts.id, payment.debtId), eq(debts.isDeleted, false))).for("update");
        if (!debt) throw new TRPCError({ code: "NOT_FOUND", message: "Долг не найден" });
        const rows = await tx.select().from(debtPayments).where(eq(debtPayments.debtId, debt.id));
        if (rows.some(p => p.id === payment.id)) return;
        if (debt.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "Этот долг уже закрыт" });
        const remaining = debtRemaining(debt.amount, rows);
        if (payment.amount > remaining) throw new TRPCError({ code: "BAD_REQUEST", message: "Платёж больше остатка по долгу" });
        await tx.insert(debtPayments).values(payment).onDuplicateKeyUpdate({ set: { id: payment.id } });
        if (input.recordExpense) await tx.insert(transactions).values({ id: payment.id, kind: debt.direction === "i_owe" ? "expense" : "income", amount: payment.amount, currency: debt.currency, category: "Долги", note: `${debt.counterparty}${payment.note ? ` · ${payment.note}` : ""}`, happenedAt: new Date(`${payment.date}T12:00:00Z`) }).onDuplicateKeyUpdate({ set: { id: payment.id } });
        if (payment.amount === remaining) await tx.update(debts).set({ status: "closed", updatedAt: new Date() }).where(eq(debts.id, debt.id));
      });
    }
    return { id: record.data.id };
  }),
  remove: protectedQuery.input(z.object({ entity: z.enum(["debts", "payments"]), id: z.string().uuid() })).mutation(async ({ input }) => {
    if (input.entity === "payments") {
      await getDb().transaction(async tx => {
        const [payment] = await tx.select().from(debtPayments).where(eq(debtPayments.id, input.id));
        if (!payment) return;
        await tx.select().from(debts).where(eq(debts.id, payment.debtId)).for("update");
        await tx.update(debtPayments).set({ isDeleted: true, updatedAt: new Date() }).where(eq(debtPayments.id, input.id));
        await tx.update(transactions).set({ isDeleted: true, updatedAt: new Date() }).where(eq(transactions.id, input.id));
        await tx.update(debts).set({ status: "open", updatedAt: new Date() }).where(and(eq(debts.id, payment.debtId), eq(debts.isDeleted, false)));
      }); return { ok: true };
    }
    const table = input.entity === "debts" ? debts : debtPayments;
    await getDb().update(table).set({ isDeleted: true, updatedAt: new Date() }).where(eq(table.id, input.id)); return { ok: true };
  }),
});
