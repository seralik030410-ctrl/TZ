import { describe, expect, it } from "vitest";
import { agencyTotals, agencyProfitTrend, dealProfit, outstanding, agencyEvents } from "./agency";
import { addCalendarDays, dayInZone, minorUnits } from "./shared";

describe("agency money and dates", () => {
  it("calculates profit without double counting commission", () => {
    expect(dealProfit({ sale: 10000, cost: 6500 })).toBe(3500);
  });
  it("does not count deleted payments or permit a negative remainder", () => {
    expect(outstanding(10000, [{ amount: 3000 }, { amount: 5000, isDeleted: true }])).toBe(7000);
    expect(outstanding(100, [{ amount: 200 }])).toBe(0);
  });
  it("keeps currencies separate and only recognizes completed period profit", () => {
    const rows = [
      { id: "a", sale: 10000, cost: 6000, currency: "USD", status: "completed", completedOn: "2026-10-05" },
      { id: "b", sale: 50000, cost: 10000, currency: "TJS", status: "working", completedOn: null },
      { id: "c", sale: 500, cost: 0, currency: "USD", status: "cancelled", completedOn: null },
    ];
    expect(agencyTotals(rows, [], "2026-10")).toEqual({ USD: { profit: 4000, receivable: 10000 }, TJS: { profit: 0, receivable: 50000 } });
  });
  it("groups completed profit by local completion day and currency", () => {
    const rows = [
      { sale: 10000, cost: 6000, currency: "USD", status: "completed", completedOn: "2026-10-30" },
      { sale: 20000, cost: 5000, currency: "TJS", status: "completed", completedOn: "2026-10-30" },
      { sale: 10000, cost: 0, currency: "USD", status: "working", completedOn: "2026-10-30" },
      { sale: 10000, cost: 0, currency: "USD", status: "completed", completedOn: "2026-09-30" },
    ];
    const trend = agencyProfitTrend(rows, "2026-10-30", "USD");
    expect(trend).toHaveLength(30);
    expect(trend.at(-1)).toEqual({ date: "2026-10-30", amount: 4000 });
    expect(trend[0]).toEqual({ date: "2026-10-01", amount: 0 });
  });
  it("uses the user timezone across UTC midnight", () => {
    expect(dayInZone(new Date("2026-10-29T20:00:00Z"), "Asia/Dushanbe")).toBe("2026-10-30");
    expect(addCalendarDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("parses hundredths exactly and rejects extra decimals", () => {
    expect(minorUnits("12.34")).toBe(1234);
    expect(() => minorUnits("1.005")).toThrow();
  });
  it("emits departure reminders at 7, 3 and 1 days", () => {
    const deal = { id: "a", title: "Дубай", departureOn: "2026-11-06", paymentDue: "2026-11-01", status: "working" };
    expect(agencyEvents([deal], [], [], "2026-10-30", true).map(x => x.kind)).toEqual(["payment", "departure"]);
    expect(agencyEvents([{ ...deal, status: "cancelled" }], [], [], "2026-10-30", true)).toEqual([]);
  });
});
