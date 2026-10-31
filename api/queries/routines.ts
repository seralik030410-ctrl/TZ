import { privateScope } from "../lib/access";
import { currentUserId, currentSettingsId } from "../lib/accountContext";
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./connection";
import { taskTemplates, tasks, settings, dayClosures, scheduleItems, scheduleExceptions } from "../../db/schema";
import { dayInZone, addCalendarDays, zonedDateAt } from "../../contracts/shared";
import { repeatsOn } from "../../contracts/routines";
import { scheduleForDay } from "../../contracts/schedule";

import { createOnce } from "../moduleStore";
import { lockPlanning } from "../sharing";

export function occurrenceId(templateId: string, day: string) {
  const hex = createHash("sha256").update(`ritm:${currentUserId()}:${templateId}:${day}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function materializeRoutines() {
  const db = getDb();
  await db.transaction(async tx => {
    await lockPlanning(tx);
    const [prefs] = await tx.select().from(settings).where(and(privateScope(settings), eq(settings.id, currentSettingsId()))).for("update");
    const day = dayInZone(new Date(), prefs?.timezone);
    const [closed] = await tx.select().from(dayClosures).where(and(privateScope(dayClosures), eq(dayClosures.day, day)));
    const templates = await tx.select().from(taskTemplates).where(and(privateScope(taskTemplates), and(eq(taskTemplates.isDeleted, false), eq(taskTemplates.paused, false))));
    const schedule = await tx.select().from(scheduleItems).where(and(privateScope(scheduleItems), eq(scheduleItems.isDeleted, false)));
    const exceptions = await tx.select().from(scheduleExceptions).where(and(privateScope(scheduleExceptions), eq(scheduleExceptions.isDeleted, false)));
    for (const template of templates) {
      const candidates = template.weekdays?.split(",").length === 1 ? Array.from({ length: 8 }, (_, offset) => addCalendarDays(day, offset)) : [day];
      const dates = candidates.filter(date => repeatsOn(template, date) && !(closed && date === day));
      for (const date of dates) {
      const id = occurrenceId(template.id, date);
      const linkedEvent = template.startMin === null ? undefined : scheduleForDay(schedule, exceptions, date).find(event => event.startMin === template.startMin && event.endMin >= event.startMin + template.estimateMin);
      const plannedStart = template.startMin === null ? null : zonedDateAt(date, template.startMin, prefs?.timezone);
      const plannedEnd = plannedStart ? new Date(plannedStart.getTime() + template.estimateMin * 60000) : null;
      await createOnce(tasks, { id, title: template.title, estimateMin: template.estimateMin, due: date, recurrence: template.id, scheduleItemId: linkedEvent?.id ?? null, plannedStart, plannedEnd, isMit: template.isMit, importance: template.isMit ? 3 : 2 }, tx);
      if (linkedEvent) await tx.update(tasks).set({ scheduleItemId: linkedEvent.id, updatedAt: new Date() }).where(and(privateScope(tasks), eq(tasks.id, id), isNull(tasks.scheduleItemId)));
      const titles = JSON.parse(template.subtaskTitles || "[]") as string[];
      for (const [index, title] of titles.entries()) {
        const childId = occurrenceId(`${template.id}:${index}`, date);
        await createOnce(tasks, { id: childId, title, due: date, parentId: id, scheduleItemId: linkedEvent?.id ?? null, position: index }, tx);
      }
      if (linkedEvent) await tx.update(tasks).set({ scheduleItemId: linkedEvent.id, updatedAt: new Date() }).where(and(privateScope(tasks), eq(tasks.parentId, id), isNull(tasks.scheduleItemId)));
      }
    }
  });
}
