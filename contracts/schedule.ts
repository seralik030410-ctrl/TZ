import { z } from "zod";
import { calendarDate, title, uuid } from "./shared";
export const scheduleSchema = z.object({ id: z.string().min(1).max(36), title, kind: z.enum(["class", "lunch", "work", "meeting", "sleep"]), startMin: z.number().int().min(0).max(1439), endMin: z.number().int().min(1).max(1440), weekdays: z.string().regex(/^[1-7](,[1-7])*$/), weekParity: z.enum(["all", "even", "odd"]).default("all"), location: z.string().max(180).nullable().default(null) }).refine(s => s.endMin > s.startMin, { path: ["endMin"], message: "Конец должен быть позже начала" });
export const exceptionSchema = z.object({ id: uuid, itemId: z.string().min(1).max(36), date: calendarDate, action: z.enum(["cancel", "move"]), startMin: z.number().int().min(0).max(1439).nullable().default(null), endMin: z.number().int().min(1).max(1440).nullable().default(null) }).refine(e => e.action === "cancel" || e.startMin !== null && e.endMin !== null && e.endMin > e.startMin, { path: ["endMin"], message: "Для переноса укажите начало и конец" });
export function scheduleForDay<T extends { id: string; weekdays: string; weekParity: string; startMin: number; endMin: number; onDate?: string | null }>(items: T[], exceptions: { itemId: string; date: string; action: string; startMin: number | null; endMin: number | null; isDeleted?: boolean }[], day: string): T[] {
  const date = new Date(`${day}T12:00:00Z`); const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const week = Math.ceil(((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return items.filter(item => item.onDate ? item.onDate === day : item.weekdays.split(",").map(Number).includes(weekday) && (item.weekParity === "all" || item.weekParity === (week % 2 ? "odd" : "even"))).flatMap(item => {
    const exception = exceptions.find(e => !e.isDeleted && e.itemId === item.id && e.date === day);
    if (exception?.action === "cancel") return [];
    return [{ ...item, startMin: exception?.startMin ?? item.startMin, endMin: exception?.endMin ?? item.endMin }];
  }).sort((a, b) => a.startMin - b.startMin);
}
