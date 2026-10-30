import { z } from "zod";

export const uuid = z.string().uuid();
export const money = z.number().int().min(0).max(2_000_000_000);
export const currencyCode = z.enum(["USD", "TJS", "RUB", "EUR", "KZT"]);
export const calendarDate = z.iso.date();
export const optionalDate = calendarDate.nullable().default(null);
export const note = z.string().max(5000).default("");
export const title = z.string().trim().min(1).max(180);
export const decimalValue = z.string().regex(/^\d{1,10}(\.\d{1,6})?$/, "Укажите положительное число, до 6 знаков после точки");
export const timezoneSchema = z.string().refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}, "Неизвестный часовой пояс");

export function dayInZone(date = new Date(), timeZone = "Asia/Dushanbe") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function dayDistance(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}
export function addCalendarDays(day: string, amount: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}
export function minutesInZone(date: Date, timeZone = "Asia/Dushanbe") {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Number(parts.find(p => p.type === "hour")?.value) * 60 + Number(parts.find(p => p.type === "minute")?.value);
}
export function zonedDateAt(day: string, minutes: number, timeZone = "Asia/Dushanbe") {
  const target = Date.parse(`${day}T00:00:00Z`) + minutes * 60000;
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const date = new Date(guess);
    const rendered = Date.parse(`${dayInZone(date, timeZone)}T00:00:00Z`) + minutesInZone(date, timeZone) * 60000;
    if (rendered === target) return date;
    guess += target - rendered;
  }
  throw new Error("Это время отсутствует в выбранном часовом поясе");
}
export function daysLeftInMonth(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate() - date + 1;
}
export function minorUnits(value: string) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new Error("Сумма: не больше двух знаков после точки");
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || Math.abs(result) > 2_000_000_000) throw new Error("Слишком большая сумма");
  return negative ? -result : result;
}
export function moneyText(value: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 2 }).format(value / 100);
}
export const live = <T extends { isDeleted?: boolean }>(rows: T[]) => rows.filter(row => !row.isDeleted);
export function normalizeCurrency(value = "RUB"): z.infer<typeof currencyCode> {
  const normalized = ({ "₽": "RUB", "$": "USD", "€": "EUR", "₸": "KZT", "сом": "TJS" }[value] ?? value);
  return currencyCode.parse(normalized);
}
export type AttentionEvent = { id: string; title: string; date: string; kind: string; path: string };
