import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./connection";
import { taskTemplates, tasks, settings, dayClosures } from "../../db/schema";
import { dayInZone } from "../../contracts/shared";
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
    if (closed) return;
    const templates = await tx.select().from(taskTemplates).where(and(eq(taskTemplates.isDeleted, false), eq(taskTemplates.paused, false)));
    for (const template of templates.filter(t => repeatsOn(t, day))) {
      const id = occurrenceId(template.id, day);
      await tx.insert(tasks).values({ id, title: template.title, estimateMin: template.estimateMin, due: day, recurrence: template.id }).onDuplicateKeyUpdate({ set: { id } });
      const titles = JSON.parse(template.subtaskTitles || "[]") as string[];
      for (const [index, title] of titles.entries()) {
        const childId = occurrenceId(`${template.id}:${index}`, day);
        await tx.insert(tasks).values({ id: childId, title, due: day, parentId: id, position: index }).onDuplicateKeyUpdate({ set: { id: childId } });
      }
    }
  });
}
