import { z } from "zod";
import { calendarDate } from "./shared";

export const paymentFields = z.object({ status: z.enum(["posted", "pending"]).default("posted"), expectedOn: calendarDate.nullable().default(null) });
export function assertPaymentKind(kind: string, status: string) {
  if (status === "pending" && kind !== "income") throw new Error("Ожидание доступно только для дохода");
}
export function splitPayments<T extends { id: string; status?: string }>(rows: T[]) {
  return { posted: rows.filter(row => row.status !== "pending"), pending: rows.filter(row => row.status === "pending") };
}
