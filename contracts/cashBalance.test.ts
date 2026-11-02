import { expect, it } from "vitest";
import { cashBalance } from "./cashBalance";
it("spends from received transfers and carries the remaining money across months", () => {
  expect(cashBalance([{ kind: "income", amount: 15000, currency: "TJS" }, { kind: "expense", amount: 3000, currency: "TJS" }], "TJS")).toBe(12000);
});
it("excludes expected, archived and foreign currency money without hiding deficits", () => {
  expect(cashBalance([{ kind: "income", amount: 90000, currency: "TJS", status: "pending" }, { kind: "income", amount: 5000, currency: "USD" }, { kind: "income", amount: 10000, currency: "TJS", isDeleted: true }, { kind: "expense", amount: 100, currency: "TJS" }], "TJS")).toBe(-100);
});
