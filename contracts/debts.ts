import { z } from "zod";
import { uuid, title, note, money, currencyCode, calendarDate, live } from "./shared";
export const debtSchema = z.object({ id: uuid, direction: z.enum(["i_owe", "owed_to_me"]), counterparty: title, amount: money.positive(), currency: currencyCode, borrowedOn: calendarDate, dueOn: calendarDate.nullable().default(null), note, status: z.enum(["open", "closed"]).default("open") });
export const debtPaymentSchema = z.object({ id: uuid, debtId: uuid, amount: money.positive(), date: calendarDate, note });
export const debtsWriteSchema = z.discriminatedUnion("entity", [z.object({ entity: z.literal("debts"), data: debtSchema }), z.object({ entity: z.literal("payments"), data: debtPaymentSchema })]);
export const debtRemaining = (principal: number, payments: { amount: number; isDeleted?: boolean }[]) => Math.max(0, principal - live(payments).reduce((sum, payment) => sum + payment.amount, 0));
export const debtProgress = (principal: number, remaining: number) => principal > 0 ? Math.min(100, Math.max(0, (principal - remaining) / principal * 100)) : 100;
export function monthlyPayment(remaining: number, today: string, due: string | null) {
  if (remaining <= 0) return 0;
  if (!due || due < today) return remaining;
  const [y, m] = today.split("-").map(Number); const [dy, dm] = due.split("-").map(Number);
  return Math.ceil(remaining / Math.max(1, (dy - y) * 12 + dm - m + 1));
}
export const debtOverdue = (due: string | null, remaining: number, status: string, today: string) => Boolean(due && due < today && remaining > 0 && status === "open");
export function debtTotals(debts: { id: string; direction: string; currency: string; amount: number; status: string; isDeleted?: boolean }[], payments: { debtId: string; amount: number; isDeleted?: boolean }[]) {
  const result: Record<string, Record<string, { principal: number; paid: number; remaining: number }>> = {};
  for (const debt of live(debts).filter(d => d.status === "open")) {
    const direction = result[debt.direction] ??= {}; const total = direction[debt.currency] ??= { principal: 0, paid: 0, remaining: 0 };
    total.principal += debt.amount;
    total.paid += debt.amount - debtRemaining(debt.amount, payments.filter(p => p.debtId === debt.id));
  }
  for (const currency of Object.values(result)) for (const amount of Object.values(currency)) amount.remaining = amount.principal - amount.paid;
  return result;
}
