import { describe, expect, it } from "vitest";
import { returnRate, dayRate, lossStreak, goldStop, goldStats } from "./gold";
const rule = { dailyLoss: 10000, dailyGoal: 20000, maxTrades: 5, maxRiskPercent: "2", pauseAfter: 2, pauseMinutes: 30 };
const trade = (id: string, result: number, date = "2026-10-30T10:00:00Z") => ({ id, result, commission: 0, status: "closed", date, currency: "USD" });
describe("gold discipline", () => {
  it("keeps a recorded stop active even if losing trades are edited or removed", () => {
    const stop = goldStop([], { ...rule, lockUntil: "2026-10-30T11:00:00Z", lockReason: "Дневной лимит убытка", lockKey: "saved-stop" }, new Date("2026-10-30T10:30:00Z"), "UTC");
    expect(stop.blocked).toBe(true); expect(stop.key).toBe("saved-stop");
  });
  it("returns no percentage for zero deposits or unknown starting balance", () => {
    expect(returnRate(0, 100, 0)).toBeNull(); expect(dayRate(100, null)).toBeNull();
    expect(returnRate(10000, 11000, 1000)).toBe(20);
  });
  it("uses net results including fees and excludes open trades", () => {
    expect(goldStats([{ ...trade("1", 500), commission: 100 }, { ...trade("2", -500), status: "open" }]).net).toBe(400);
  });
  it("sorts losing streak by timestamp and resets at a win", () => {
    expect(lossStreak([trade("3", -100, "2026-10-30T12:00:00Z"), trade("1", -100), trade("2", 100, "2026-10-30T11:00:00Z")])).toBe(1);
  });
  it("blocks exactly at the daily loss threshold", () => {
    expect(goldStop([trade("a", -10000)], rule, new Date("2026-10-30T10:01:00Z"), "Asia/Dushanbe").blocked).toBe(true);
  });
  it("expires the consecutive-loss pause and counts user-local days", () => {
    const rows = [trade("a", -100), trade("b", -100, "2026-10-30T10:05:00Z")];
    expect(goldStop(rows, rule, new Date("2026-10-30T10:20:00Z"), "Asia/Dushanbe").blocked).toBe(true);
    expect(goldStop(rows, rule, new Date("2026-10-30T10:36:00Z"), "Asia/Dushanbe").blocked).toBe(false);
    expect(goldStop([trade("a", -10000, "2026-10-29T20:00:00Z")], rule, new Date("2026-10-30T01:00:00Z"), "Asia/Dushanbe").blocked).toBe(true);
  });
  it("blocks the maximum trade count even when all trades are open", () => {
    expect(goldStop(Array.from({ length: 5 }, (_, i) => ({ ...trade(String(i), 0), status: "open" })), rule, new Date("2026-10-30T10:01:00Z"), "UTC").reason).toContain("сделок");
  });
});
