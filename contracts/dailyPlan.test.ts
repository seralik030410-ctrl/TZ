import { describe, it, expect } from "vitest";
import { buildDailyPlan } from "./dailyPlan";
import { zonedDateAt, dayInZone } from "./shared";
const task = (id: string, extra = {}) => ({ id, title: id, estimateMin: 60, importance: 2, isMit: false, status: "plan", ...extra });
const input = { day: "2026-10-30", startMin: 480, endMin: 720, reservePercent: 20, tasks: [task("a"), task("b")], events: [], alreadyPlanned: [] };
describe("daily planning", () => {
  it("keeps fixed events free and retains a reserve", () => { const result = buildDailyPlan({ ...input, events: [{ id: "class", startMin: 540, endMin: 600 }] }); expect(result.plannedMinutes).toBeLessThanOrEqual(144); expect(result.blocks.every(b => b.endMin <= 540 || b.startMin >= 600)).toBe(true); });
  it("plans dependencies before higher-priority successors", () => { const result = buildDailyPlan({ ...input, tasks: [task("b", { dependsOn: "a", isMit: true }), task("a")] }); expect(result.blocks.map(b => b.taskId)).toEqual(["a", "b"]); });
  it("reports cycles without placing either task", () => { const result = buildDailyPlan({ ...input, tasks: [task("a", { dependsOn: "b" }), task("b", { dependsOn: "a" })] }); expect(result.blocks).toEqual([]); expect(result.unallocated).toHaveLength(2); });
  it("does not duplicate existing blocks or completed tasks", () => { expect(buildDailyPlan({ ...input, tasks: [task("a", { status: "done" }), task("b")], alreadyPlanned: ["b"] }).blocks).toEqual([]); });
  it("converts a user-local time into an instant", () => { expect(zonedDateAt("2026-10-30", 540, "Asia/Dushanbe").toISOString()).toBe("2026-10-30T04:00:00.000Z"); expect(dayInZone(zonedDateAt("2026-10-30", 0), "Asia/Dushanbe")).toBe("2026-10-30"); });
});
