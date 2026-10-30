import { getFreeWindows, type MinuteEvent, type PlannedAllocation } from "./planning";
import { dayDistance } from "./shared";
export type DailyTask = { id: string; title: string; estimateMin: number; importance: number; isMit: boolean; due?: string | null; dependsOn?: string | null; flexibility?: string; status: string; position?: number };
export function buildDailyPlan(input: { day: string; startMin: number; endMin: number; reservePercent: number; tasks: DailyTask[]; events: MinuteEvent[]; alreadyPlanned: string[] }) {
  const windows = getFreeWindows(input.startMin, input.endMin, input.events).map(w => ({ ...w }));
  const capacity = windows.reduce((s, w) => s + w.endMin - w.startMin, 0);
  let budget = Math.floor(capacity * (1 - input.reservePercent / 100) / 30) * 30;
  const excluded = new Set(input.alreadyPlanned);
  const completed = new Set(input.tasks.filter(t => t.status === "done").map(t => t.id));
  const candidates = input.tasks.filter(t => t.status !== "done" && t.flexibility !== "fixed" && !excluded.has(t.id));
  const score = (t: DailyTask) => (t.isMit ? 100000 : 0) + t.importance * 1000 + (t.due ? 500 - Math.max(-30, Math.min(30, dayDistance(input.day, t.due))) * 10 : 0);
  const pending = [...candidates].sort((a, b) => score(b) - score(a) || (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
  const blocks: PlannedAllocation[] = [];
  const unallocated: { taskId: string; title: string; minutes: number; reason: string }[] = [];
  const ends = new Map<string, number>();
  while (pending.length) {
    const index = pending.findIndex(t => !t.dependsOn || completed.has(t.dependsOn) || ends.has(t.dependsOn));
    if (index < 0) { for (const task of pending) unallocated.push({ taskId: task.id, title: task.title, minutes: task.estimateMin, reason: "Зависимость не завершена, не помещается или образует цикл" }); break; }
    const [task] = pending.splice(index, 1);
    let remaining = Math.max(30, Math.ceil(task.estimateMin / 30) * 30);
    const after = task.dependsOn ? ends.get(task.dependsOn) ?? input.startMin : input.startMin;
    for (const window of windows) {
      if (remaining <= 0 || budget < 30) break;
      const start = Math.max(window.startMin, after);
      const duration = Math.floor(Math.min(window.endMin - start, remaining, budget) / 30) * 30;
      if (duration < 30) continue;
      blocks.push({ taskId: task.id, day: input.day, startMin: start, endMin: start + duration });
      window.startMin = start + duration; budget -= duration; remaining -= duration;
      if (!remaining) ends.set(task.id, window.startMin);
    }
    if (remaining) unallocated.push({ taskId: task.id, title: task.title, minutes: remaining, reason: "Не хватает свободного времени с учётом резерва" });
  }
  return { blocks, unallocated, capacity, reserved: capacity - Math.floor(capacity * (1 - input.reservePercent / 100) / 30) * 30, plannedMinutes: blocks.reduce((s, b) => s + b.endMin - b.startMin, 0) };
}
