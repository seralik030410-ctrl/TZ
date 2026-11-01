import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./queries/connection";
import { settings, tasks, scheduleItems, scheduleExceptions, scheduledBlocks } from "../db/schema";
import { users, workspaceMembers, OWNER_ID } from "../db/accounts";
import { currentAccount, currentSettingsId } from "./lib/accountContext";
import { scheduleForDay } from "../contracts/schedule";
import { addCalendarDays, dayInZone, zonedDateAt } from "../contracts/shared";

type Db = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Busy = { id: string; start: Date; end: Date };
export async function lockPlanning(db: Db) {
  await db.select({ id: users.id }).from(users).where(eq(users.id, OWNER_ID)).for("update");
  const account = currentAccount();
  if (account.checksTaskEpoch) {
    const [prefs] = await db.select().from(settings).where(eq(settings.id, currentSettingsId()));
    if ((prefs?.taskEpoch ?? 0) !== account.taskEpoch) throw new TRPCError({ code: "CONFLICT", message: "Список задач был архивирован или восстановлен. Обновите страницу; старая запись сохранена на устройстве." });
  }
}
async function members(db: Db, workspaceIds: string[]) {
  if (!workspaceIds.length) return [];
  return [...new Set((await db.select().from(workspaceMembers).where(inArray(workspaceMembers.workspaceId, workspaceIds))).map(row => row.userId))];
}
async function occupied(db: Db, ownerIds: string[], from: Date, to: Date, skipTasks: string[] = [], skipBlocks: string[] = []): Promise<Busy[]> {
  if (!ownerIds.length) return [];
  const [prefs, events, exceptions, blocks, taskRows] = await Promise.all([
    db.select().from(settings).where(inArray(settings.ownerId, ownerIds)),
    db.select().from(scheduleItems).where(and(inArray(scheduleItems.ownerId, ownerIds), eq(scheduleItems.isDeleted, false))),
    db.select().from(scheduleExceptions).where(and(inArray(scheduleExceptions.ownerId, ownerIds), eq(scheduleExceptions.isDeleted, false))),
    db.select().from(scheduledBlocks).where(and(inArray(scheduledBlocks.ownerId, ownerIds), eq(scheduledBlocks.isDeleted, false))),
    db.select().from(tasks).where(and(inArray(tasks.ownerId, ownerIds), eq(tasks.isDeleted, false))),
  ]);
  const result: Busy[] = [];
  const add = (start: Date, end: Date) => { if (start < to && end > from) result.push({ id: `busy-${result.length}`, start, end }); };
  for (const id of ownerIds) {
    const zone = prefs.find(row => row.ownerId === id)?.timezone ?? "Asia/Dushanbe";
    const last = dayInZone(to, zone);
    for (let day = addCalendarDays(dayInZone(from, zone), -1); day <= last; day = addCalendarDays(day, 1)) {
      for (const event of scheduleForDay(events.filter(row => row.ownerId === id), exceptions.filter(row => row.ownerId === id), day)) add(zonedDateAt(day, event.startMin, zone), zonedDateAt(day, event.endMin, zone));
    }
  }
  for (const block of blocks) if (block.status === "planned" && !skipBlocks.includes(block.id) && !skipTasks.includes(block.taskId)) add(block.start, block.end);
  for (const task of taskRows) if (task.status !== "done" && task.plannedStart && task.plannedEnd && !skipTasks.includes(task.id)) add(task.plannedStart, task.plannedEnd);
  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}
export async function assertSharedSlot(db: Db, taskIds: string[], start: Date, end: Date, excludeBlockIds: string[] = []) {
  if (!(start < end)) throw new TRPCError({ code: "BAD_REQUEST", message: "Конец должен быть после начала" });
  if (!taskIds.length) return;
  const rows = await db.select().from(tasks).where(inArray(tasks.id, taskIds));
  const shared = [...new Set(rows.flatMap(row => row.workspaceId ? [row.workspaceId] : []))];
  if (!shared.length) return;
  if (shared.some(id => !currentAccount().workspaceIds.includes(id))) throw new TRPCError({ code: "FORBIDDEN" });
  const ids = await members(db, shared);
  if ((await occupied(db, ids, start, end, taskIds, excludeBlockIds)).length) throw new TRPCError({ code: "CONFLICT", message: "Это время занято у участника общего проекта. Выберите свободное окно." });
}
export async function peerBusyForDay(day: string) {
  const db = getDb();
  const account = currentAccount();
  const ids = (await members(db as unknown as Db, account.workspaceIds)).filter(id => id !== account.id);
  const [prefs] = await db.select().from(settings).where(eq(settings.id, currentSettingsId()));
  const zone = prefs?.timezone ?? "Asia/Dushanbe";
  return occupied(db as unknown as Db, ids, zonedDateAt(day, 0, zone), zonedDateAt(addCalendarDays(day, 1), 0, zone));
}
