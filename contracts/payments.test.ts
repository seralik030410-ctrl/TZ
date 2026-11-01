import { expect, it } from "vitest";
import { splitPayments, paymentFields, assertPaymentKind } from "./payments";

it("keeps expected project payment out of actual money, including legacy rows", () => {
  const actual = { id: "actual", kind: "income", amount: 1000 };
  const pending = { id: "pending", kind: "income", amount: 250000, status: "pending" };
  expect(splitPayments([actual, pending])).toEqual({ posted: [actual], pending: [pending] });
});
it("defaults old writes to posted and validates an optional expected date", () => {
  expect(paymentFields.parse({})).toEqual({ status: "posted", expectedOn: null });
  expect(paymentFields.safeParse({ status: "pending", expectedOn: "2026-02-30" }).success).toBe(false);
});
it("allows expected income but never an expected expense", () => {
  expect(() => assertPaymentKind("income", "pending")).not.toThrow();
  expect(() => assertPaymentKind("expense", "pending")).toThrow();
});
