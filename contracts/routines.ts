import { z } from "zod";
import { calendarDate } from "./shared";

export const templateSchema = z.object({
  id: z.string().uuid(), title: z.string().trim().min(1).max(240),
  estimateMin: z.number().int().min(15).max(1440).default(30),
  startMin: z.number().int().min(0).max(1439).nullable().optional(),
  isMit: z.boolean().optional(),
  weekdays: z.string().regex(/^[1-7](,[1-7])*$/).nullable().default(null),
  startsOn: calendarDate, endsOn: calendarDate.nullable().default(null), paused: z.boolean().default(false),
}).refine(v => !v.endsOn || v.endsOn >= v.startsOn, { path: ["endsOn"], message: "Окончание раньше начала" });

export function repeatsOn(template: { startsOn: string; endsOn: string | null; weekdays: string | null; paused: boolean; isDeleted?: boolean }, day: string) {
  if (template.paused || template.isDeleted || !template.weekdays || day < template.startsOn || template.endsOn && day > template.endsOn) return false;
  return template.weekdays.split(",").includes(String(new Date(`${day}T12:00:00Z`).getUTCDay() || 7));
}
