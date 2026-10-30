import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./connection";
import { taskTemplates, tasks, settings, dayClosures } from "../../db/schema";
import { dayInZone, addCalendarDays, zonedDateAt } from "../../contracts/shared";
import { repeatsOn } from "../../contracts/routines";

export function occurrenceId(templateId: string, day: string) {
  const hex = createHash("sha256").update(`ritm:${templateId}:${day}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function materializeRoutines() {
  const db = getDb();
  await db.transaction(async tx => {
    const [prefs] = await tx.select().from(settings).where(eq(settings.id, "default")).for("update");
    const day = dayInZone(new Date(), prefs?.timezone);
    const [closed] = await tx.select().from(dayClosures).where(eq(dayClosures.day, day));
    const templates = await tx.select().from(taskTemplates).where(and(eq(taskTemplates.isDeleted, false), eq(taskTemplates.paused, false)));
    for (const template of templates) {
      const candidates = template.weekdays?.split(",").length === 1 ? Array.from({ length: 8 }, (_, offset) => addCalendarDays(day, offset)) : [day];
      const dates = candidates.filter(date => repeatsOn(template, date) && !(closed && date === day));
      for (const date of dates) {
      const id = occurrenceId(template.id, date);
      const plannedStart = template.startMin === null ? null : zonedDateAt(date, template.startMin, prefs?.timezone);
      const plannedEnd = plannedStart ? new Date(plannedStart.getTime() + template.estimateMin * 60000) : null;
      await tx.insert(tasks).values({ id, title: template.title, estimateMin: template.estimateMin, due: date, recurrence: template.id, plannedStart, plannedEnd, isMit: template.isMit, importance: template.isMit ? 3 : 2 }).onDuplicateKeyUpdate({ set: { id } });
      const titles = JSON.parse(template.subtaskTitles || "[]") as string[];
      for (const [index, title] of titles.entries()) {
        const childId = occurrenceId(`${template.id}:${index}`, date);
        await tx.insert(tasks).values({ id: childId, title, due: date, parentId: id, position: index }).onDuplicateKeyUpdate({ set: { id: childId } });
      }
      }
    }
  });
}
