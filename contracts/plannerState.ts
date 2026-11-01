import { calendarDate, zonedDateAt } from "./shared";

type TaskState = { id: string; status: string; estimateMin?: number; parentId?: string | null; scheduleItemId?: string | null; isDeleted?: boolean; plannedStart?: Date | null; plannedEnd?: Date | null };
type BlockState = { id: string; taskId: string; start: Date; end: Date; status: string; isDeleted?: boolean };
export function isStandaloneTask(task: Pick<TaskState, "parentId" | "scheduleItemId" | "status" | "isDeleted">) {
  return !task.isDeleted && task.status !== "done" && !task.parentId && !task.scheduleItemId;
}
export function containingEvent<T extends { startMin: number; endMin: number }>(events: T[], startMin: number, duration: number): T | undefined {
  const matches = events.filter(event => event.startMin <= startMin && event.endMin >= startMin + duration);
  return matches.length === 1 ? matches[0] : undefined;
}
export function remainingMinutes(task: TaskState, blocks: BlockState[]) {
  const intervals = blocks.filter(b => b.taskId === task.id && !b.isDeleted && b.status !== "cancelled").map(b => [b.start.getTime(), b.end.getTime()]).sort((a, b) => a[0] - b[0]);
  if (!intervals.length && task.plannedStart && task.plannedEnd) intervals.push([task.plannedStart.getTime(), task.plannedEnd.getTime()]);
  let covered = 0, end = -Infinity;
  for (const [start, nextEnd] of intervals) { covered += Math.max(0, nextEnd - Math.max(start, end)); end = Math.max(end, nextEnd); }
  return Math.max(0, (task.estimateMin ?? 30) - Math.round(covered / 60000));
}
export function occupiedOnDay(day: string, zone: string, tasks: TaskState[], blocks: BlockState[]) {
  const start = zonedDateAt(day, 0, zone).getTime(), end = start + 86400000;
  const active = tasks.filter(t => !t.isDeleted && t.status !== "done");
  const ids = new Set(active.map(t => t.id));
  const live = blocks.filter(b => !b.isDeleted && b.status !== "cancelled" && b.status !== "done" && ids.has(b.taskId));
  const blockedTasks = new Set(live.map(b => b.taskId));
  const intervals = [...live, ...active.filter(t => !blockedTasks.has(t.id) && t.plannedStart && t.plannedEnd && !t.scheduleItemId).map(t => ({ id: `task-${t.id}`, start: t.plannedStart!, end: t.plannedEnd! }))];
  return intervals.filter(b => b.start.getTime() < end && b.end.getTime() > start).map(b => ({ id: b.id, startMin: Math.max(0, (b.start.getTime() - start) / 60000), endMin: Math.min(1440, (b.end.getTime() - start) / 60000), fixed: true }));
}
export function validViewDay(value: string, fallback: string) { return calendarDate.safeParse(value).success ? value : fallback; }
export function inDayRange(day: string, from: string, through: string) { return day >= from && day <= through; }
export function undoBelongsToEpoch(changes: { taskEpoch?: number }, epoch: number) { return (changes.taskEpoch ?? 0) === epoch; }
export function restoreIntervals(tasks: TaskState[], blocks: BlockState[]) {
  const blocked = new Set(blocks.map(b => b.taskId));
  return [...blocks, ...tasks.filter(t => !blocked.has(t.id) && !t.scheduleItemId && !t.parentId && t.status !== "done" && t.plannedStart && t.plannedEnd).map(t => ({ id: `task-${t.id}`, taskId: t.id, start: t.plannedStart!, end: t.plannedEnd!, status: "planned" }))];
}
