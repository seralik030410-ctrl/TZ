import { describe, expect, it } from "vitest";
import { containingEvent, remainingMinutes, occupiedOnDay, isStandaloneTask, validViewDay, inDayRange, undoBelongsToEpoch, restoreIntervals } from "./plannerState";
import { buildDailyPlan } from "./dailyPlan";
import { zonedDateAt } from "./shared";
import { templateSchema } from "./routines";

const task = { id: "avatars", title: "Делать аватары", estimateMin: 120, importance: 2, isMit: false, status: "plan", parentId: null, scheduleItemId: null, isDeleted: false };
const block = (id: string, start: number, end: number, extra = {}) => ({ id, taskId: task.id, start: zonedDateAt("2026-11-01", start), end: zonedDateAt("2026-11-01", end), status: "planned", isDeleted: false, ...extra });
describe("consistent planner state", () => {
  it("rejects a pre-archive undo even when the request carries the current epoch", () => {
    expect(undoBelongsToEpoch({ taskEpoch: 0 }, 1)).toBe(false);
    expect(undoBelongsToEpoch({}, 1)).toBe(false);
    expect(undoBelongsToEpoch({ taskEpoch: 1 }, 1)).toBe(true);
  });
  it("covers direct planned work and validates its interval on restore", () => {
    const direct = { ...task, plannedStart: zonedDateAt("2026-11-01", 540), plannedEnd: zonedDateAt("2026-11-01", 600) };
    expect(remainingMinutes(direct, [])).toBe(60);
    expect(restoreIntervals([direct], [])).toHaveLength(1);
    expect(restoreIntervals([{ ...direct, scheduleItemId: "class" }], [])).toHaveLength(0);
  });
  it("preserves the five checklist steps when saving a weekly template", () => {
    const titles = JSON.stringify(["Первый", "Второй", "Третий", "Четвёртый", "Пятый"]);
    expect(templateSchema.parse({ id: "00000000-0000-4000-8000-000000000001", title: "Записать людей", startsOn: "2026-11-01", weekdays: "1", startMin: 540, subtaskTitles: titles })).toHaveProperty("subtaskTitles", titles);
  });
  it("nests a 09:00 checklist in an 08:00–12:00 class, but never chooses an ambiguous class", () => {
    const event = { id: "class", startMin: 480, endMin: 720 };
    expect(containingEvent([event], 540, 30)?.id).toBe("class");
    expect(containingEvent([event], 710, 30)).toBeUndefined();
    expect(containingEvent([event, { ...event, id: "other" }], 540, 30)).toBeUndefined();
  });
  it("keeps the remaining 90 minutes visible after a partial allocation", () => {
    expect(remainingMinutes(task, [block("b", 540, 570)])).toBe(90);
    expect(remainingMinutes(task, [block("b", 540, 570, { isDeleted: true })])).toBe(120);
    expect(remainingMinutes(task, [block("b", 540, 720)])).toBe(0);
  });
  it("ignores orphan blocks and clips cross-midnight occupation", () => {
    expect(occupiedOnDay("2026-11-01", "Asia/Dushanbe", [], [block("orphan", 540, 600)])).toEqual([]);
    const events = occupiedOnDay("2026-11-01", "Asia/Dushanbe", [task], [block("b", 0, 60, { start: zonedDateAt("2026-10-31", 1410) })]);
    expect(events[0]).toMatchObject({ startMin: 0, endMin: 60 });
  });
  it("does not treat checklist steps or event tasks as independent workload", () => {
    expect(isStandaloneTask({ ...task, parentId: "parent" })).toBe(false);
    expect(isStandaloneTask({ ...task, scheduleItemId: "class" })).toBe(false);
    const result = buildDailyPlan({ day: "2026-11-01", startMin: 480, endMin: 900, reservePercent: 0, tasks: [{ ...task, scheduleItemId: "class" }, { ...task, id: "step", parentId: "avatars" }], events: [], alreadyPlanned: [] });
    expect(result.blocks).toEqual([]);
  });
  it("recovers an empty viewing date and bounds weekly history", () => {
    expect(validViewDay("", "2026-11-01")).toBe("2026-11-01");
    expect(validViewDay("2026-02-30", "2026-11-01")).toBe("2026-11-01");
    expect(inDayRange("2026-11-02", "2026-10-26", "2026-11-01")).toBe(false);
  });
});
