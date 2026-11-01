export type MinuteEvent = {
  id: string;
  startMin: number;
  endMin: number;
  fixed?: boolean;
  flexibility?: "fixed" | "flexible" | "optional";
  priority?: number;
};

export type MinuteWindow = { startMin: number; endMin: number };

export function dependencyHasCycle(tasks: { id: string; dependsOn: string | null }[], taskId: string, dependsOn: string | null) {
  if (!dependsOn) return false;
  const byId = new Map(tasks.map(task => [task.id, task.dependsOn]));
  const visited = new Set([taskId]);
  let current: string | null = dependsOn;
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = byId.get(current) ?? null;
  }
  return false;
}

export function taskOrderMatches(expected: { id: string; position: number; status: string }[], current: { id: string; position: number; status: string }[]) {
  if (expected.length !== current.length) return false;
  const actual = new Map(current.map(task => [task.id, task]));
  return expected.every(task => {
    const row = actual.get(task.id);
    return row?.position === task.position && row.status === task.status;
  });
}

export function getFreeWindows(
  dayStartMin: number,
  dayEndMin: number,
  events: MinuteEvent[],
  minimumMinutes = 30,
): MinuteWindow[] {
  const sorted = events
    .filter((event) => event.endMin > dayStartMin && event.startMin < dayEndMin)
    .map((event) => ({
      startMin: Math.max(dayStartMin, event.startMin),
      endMin: Math.min(dayEndMin, event.endMin),
    }))
    .sort((a, b) => a.startMin - b.startMin);

  const windows: MinuteWindow[] = [];
  let cursor = dayStartMin;
  for (const event of sorted) {
    if (event.startMin - cursor >= minimumMinutes) {
      windows.push({ startMin: cursor, endMin: event.startMin });
    }
    cursor = Math.max(cursor, event.endMin);
  }
  if (dayEndMin - cursor >= minimumMinutes) {
    windows.push({ startMin: cursor, endMin: dayEndMin });
  }
  return windows;
}

export type PlanningTask = {
  id: string;
  estimateMin: number;
  priority: number;
  dependsOn?: string | null;
  due?: string | null;
};

export type PlannedAllocation = {
  taskId: string;
  day: string;
  startMin: number;
  endMin: number;
};

export function allocateTasks(
  tasksToPlan: PlanningTask[],
  windowsByDay: Record<string, MinuteWindow[]>,
  estimationFactor = 1,
  dailyCapMinutes = Number.POSITIVE_INFINITY,
): PlannedAllocation[] {
  const result: PlannedAllocation[] = [];
  const ordered = [...tasksToPlan].sort((a, b) => b.priority - a.priority);
  const remainingByDay = Object.fromEntries(
    Object.keys(windowsByDay).map((day) => [day, dailyCapMinutes]),
  ) as Record<string, number>;

  const completed = new Map<string, { day: string; endMin: number }>();
  while (ordered.length) {
    const index = ordered.findIndex(task => !task.dependsOn || completed.has(task.dependsOn));
    if (index < 0) break;
    const [task] = ordered.splice(index, 1);
    const after = task.dependsOn ? completed.get(task.dependsOn) : undefined;
    let remaining = Math.max(30, Math.round(task.estimateMin * estimationFactor));
    for (const [day, windows] of Object.entries(windowsByDay).sort(([a], [b]) => a.localeCompare(b))) {
      if (task.due && day > task.due) continue;
      if (after && day < after.day) continue;
      if (remaining <= 0) break;
      for (const window of windows) {
        const start = Math.max(window.startMin, after?.day === day ? after.endMin : 0);
        if (remaining <= 0 || remainingByDay[day] <= 0) break;
        const available = Math.min(
          window.endMin - start,
          remainingByDay[day],
        );
        if (available < 30) continue;
        const duration = Math.min(available, remaining);
        if (duration < 30) continue;
        const allocation: PlannedAllocation = {
          taskId: task.id,
          day,
          startMin: start,
          endMin: start + duration,
        };
        result.push(allocation);
        window.startMin = start + duration;
        remainingByDay[day] -= duration;
        remaining -= duration;
        if (!remaining) completed.set(task.id, { day, endMin: window.startMin });
      }
    }
  }
  return result;
}

export function safeToSpendToday(input: {
  monthlyLimit: number;
  spentThisMonth: number;
  mandatoryPayments: number;
  savingsContributions: number;
  cushion: number;
  daysRemaining: number;
}): number {
  const available =
    input.monthlyLimit -
    input.spentThisMonth -
    input.mandatoryPayments -
    input.savingsContributions -
    input.cushion;
  return Math.max(0, Math.floor(available / Math.max(1, input.daysRemaining)));
}

export function reflowDay(
  events: MinuteEvent[],
  nowMin: number,
  dayEndMin: number,
): { placements: MinuteEvent[]; removed: string[] } {
  const fixed = events.filter(
    (event) => event.fixed || event.flexibility === "fixed",
  );
  const movable = events
    .filter((event) => !event.fixed && event.flexibility !== "fixed")
    .sort((a, b) => {
      const optionalDiff = Number(a.flexibility === "optional") - Number(b.flexibility === "optional");
      return optionalDiff || (b.priority ?? 0) - (a.priority ?? 0);
    });
  const placements: MinuteEvent[] = [...fixed];
  const removed: string[] = [];

  for (const event of movable) {
    if (event.endMin <= nowMin) {
      placements.push(event);
      continue;
    }
    const duration = event.endMin - event.startMin;
    const occupied = placements.filter((item) => item.endMin > nowMin);
    const windows = getFreeWindows(nowMin, dayEndMin, occupied, 30);
    const target = windows.find((window) => window.endMin - window.startMin >= duration);
    if (!target) {
      if (event.flexibility === "optional") removed.push(event.id);
      continue;
    }
    placements.push({
      ...event,
      startMin: target.startMin,
      endMin: target.startMin + duration,
    });
  }
  return { placements, removed };
}
