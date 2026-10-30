import { describe, expect, it } from "vitest";
import { debtRemaining, debtProgress, monthlyPayment, debtOverdue, debtTotals } from "./debts";
describe("debt calculations", () => {
  it("caps payments at the principal without a negative remainder", () => { expect(debtRemaining(10000, [{ amount: 3000 }, { amount: 9000 }])).toBe(0); });
  it("ignores deleted payments", () => { expect(debtRemaining(10000, [{ amount: 2500 }, { amount: 2000, isDeleted: true }])).toBe(7500); });
  it("calculates percentage and zero-balance cases", () => { expect(debtProgress(10000, 2500)).toBe(75); expect(debtProgress(0, 0)).toBe(100); });
  it("divides the remaining amount by the months through the due month", () => { expect(monthlyPayment(12000, "2026-10-30", "2027-01-20")).toBe(3000); expect(monthlyPayment(1, "2026-10-30", "2026-10-30")).toBe(1); });
  it("recognizes overdue open balances only", () => { expect(debtOverdue("2026-10-29", 1, "open", "2026-10-30")).toBe(true); expect(debtOverdue("2026-10-29", 0, "open", "2026-10-30")).toBe(false); });
  it("separates totals by currency and direction", () => { expect(debtTotals([{ id: "1", direction: "i_owe", currency: "TJS", amount: 1000, status: "open" }, { id: "2", direction: "owed_to_me", currency: "USD", amount: 2000, status: "open" }], [{ debtId: "1", amount: 300 }])).toEqual({ i_owe: { TJS: { principal: 1000, paid: 300, remaining: 700 } }, owed_to_me: { USD: { principal: 2000, paid: 0, remaining: 2000 } } }); });
});
