import type { RouterOutputs } from "@/providers/trpc";
import { moneyText, normalizeCurrency, dayInZone, minutesInZone, dayDistance } from "@contracts/shared";

export type PlannerData = RouterOutputs["planner"]["bootstrap"];
export type Task = PlannerData["tasks"][number];
export type Project = PlannerData["projects"][number];
export type ScheduleItem = PlannerData["schedule"][number];
export type Transaction = PlannerData["transactions"][number];

export type QuickAddKind = "task" | "expense" | "income" | "note";

export type LayoutContext = {
  data: PlannerData;
  refresh: () => void;
  openQuickAdd: (kind?: QuickAddKind) => void;
};

let userTimezone = "Asia/Dushanbe";
export const getUserTimezone = () => userTimezone;
export const setUserTimezone = (value?: string) => { userTimezone = value || "Asia/Dushanbe"; };
export const localDayKey = (date = new Date()) => dayInZone(date, userTimezone);

export const formatMoney = (value: number, currency = "TJS") =>
  moneyText(value, normalizeCurrency(currency));

export const minutesToTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

export const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
};

export const formatDate = (day: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", options ?? { day: "numeric", month: "long" }).format(
    new Date(`${day}T12:00:00`),
  );

export const dayLabel = (day?: string | null) => {
  if (!day) return "Без срока";
  const today = localDayKey();
  const tomorrow = localDayKey(new Date(Date.now() + 86_400_000));
  if (day === today) return "Сегодня";
  if (day === tomorrow) return "Завтра";
  if (day < today) return "Просрочено";
  return formatDate(day, { day: "numeric", month: "short" });
};

export const daysUntil = (day?: string | null) => {
  if (!day) return Number.POSITIVE_INFINITY;
  return dayDistance(localDayKey(), day);
};

export const greeting = () => {
  const hour = Math.floor(minutesInZone(new Date(), userTimezone) / 60);
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
};

export const projectTypeLabel: Record<string, string> = {
  money: "Деньги",
  study: "Учёба",
  personal: "Личное",
  agency: "Агентство",
};

export const projectColor: Record<string, string> = {
  money: "var(--cat-money)",
  study: "var(--cat-study)",
  personal: "var(--cat-personal)",
  agency: "var(--cat-agency)",
};

export const downloadJson = (data: unknown, filename: string) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
