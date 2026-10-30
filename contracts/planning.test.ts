import { describe, expect, it } from "vitest";
import { allocateTasks, getFreeWindows, reflowDay, safeToSpendToday, dependencyHasCycle, taskOrderMatches } from "./planning";

describe("task dependencies", () => {
  it("detects self references and indirect dependency cycles", () => {
    const rows = [{ id: "a", dependsOn: "b" }, { id: "b", dependsOn: null }];
    expect(dependencyHasCycle(rows, "b", "a")).toBe(true);
    expect(dependencyHasCycle(rows, "a", "a")).toBe(true);
    expect(dependencyHasCycle(rows, "b", null)).toBe(false);
  });
});

describe("task order conflicts", () => {
  it("rejects a stale order snapshot when another view moved or added a task", () => {
    const snapshot = [{ id: "a", position: 0, status: "plan" }, { id: "b", position: 1, status: "doing" }];
    expect(taskOrderMatches(snapshot, snapshot)).toBe(true);
    expect(taskOrderMatches(snapshot, [{ ...snapshot[0], position: 1 }, { ...snapshot[1], position: 0 }])).toBe(false);
    expect(taskOrderMatches(snapshot, [...snapshot, { id: "c", position: 2, status: "plan" }])).toBe(false);
  });
});

describe("free windows", () => {
  it("keeps fixed events and ignores gaps shorter than 30 minutes", () => {
    const windows = getFreeWindows(480, 1080, [
      { id: "class", startMin: 540, endMin: 630, fixed: true },
      { id: "lunch", startMin: 760, endMin: 800, fixed: true },
    ]);
    expect(windows).toEqual([
      { startMin: 480, endMin: 540 },
      { startMin: 630, endMin: 760 },
      { startMin: 800, endMin: 1080 },
    ]);
  });

  it("merges overlapping events without inventing time", () => {
    const windows = getFreeWindows(480, 720, [
      { id: "a", startMin: 500, endMin: 600 },
      { id: "b", startMin: 550, endMin: 650 },
    ]);
    expect(windows).toEqual([
      { startMin: 650, endMin: 720 },
    ]);
  });
});

describe("stage allocation", () => {
  it("allocates ten tasks in one pass and respects the daily cap", () => {
    const tasks = Array.from({ length: 10 }, (_, index) => ({
      id: `task-${index}`,
      estimateMin: 30,
      priority: index === 9 ? 3 : 1,
    }));
    const allocations = allocateTasks(tasks, {
      "2026-10-28": [{ startMin: 600, endMin: 750 }],
      "2026-10-29": [{ startMin: 600, endMin: 750 }],
      "2026-10-30": [{ startMin: 600, endMin: 750 }],
    }, 1, 120);
    expect(allocations).toHaveLength(10);
    expect(allocations[0].taskId).toBe("task-9");
    for (const date of ["2026-10-28", "2026-10-29", "2026-10-30"]) {
      const minutes = allocations
        .filter((item) => item.day === date)
        .reduce((sum, item) => sum + item.endMin - item.startMin, 0);
      expect(minutes).toBeLessThanOrEqual(120);
    }
  });
});

describe("safe daily spend", () => {
  it("subtracts mandatory payments and cushion before dividing", () => {
    expect(safeToSpendToday({
      monthlyLimit: 45000,
      spentThisMonth: 12000,
      mandatoryPayments: 5000,
      savingsContributions: 3000,
      cushion: 5000,
      daysRemaining: 20,
    })).toBe(1000);
  });

  it("never recommends a negative expense", () => {
    expect(safeToSpendToday({
      monthlyLimit: 1000,
      spentThisMonth: 3000,
      mandatoryPayments: 0,
      savingsContributions: 0,
      cushion: 500,
      daysRemaining: 10,
    })).toBe(0);
  });
});

describe("day reflow", () => {
  it("leaves fixed events in place and moves optional blocks first", () => {
    const result = reflowDay([
      { id: "class", startMin: 600, endMin: 660, fixed: true },
      { id: "important", startMin: 570, endMin: 630, flexibility: "flexible", priority: 3 },
      { id: "anime", startMin: 660, endMin: 720, flexibility: "optional", priority: 1 },
    ], 570, 720);
    expect(result.placements.find((event) => event.id === "class")).toMatchObject({ startMin: 600, endMin: 660 });
    expect(result.placements.find((event) => event.id === "important")).toMatchObject({ startMin: 660, endMin: 720 });
    expect(result.removed).toContain("anime");
  });
});
