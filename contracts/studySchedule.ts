export const STUDY_OWNER = "00000000-0000-4000-8000-000000000001";
export function studySchedule() {
  const rows: { title: string; kind: "class" | "work"; startMin: number; endMin: number; onDate: string; weekdays: string; weekParity: "all" }[] = [];
  for (const date = new Date("2026-11-01T12:00:00Z"); date <= new Date("2026-12-31T12:00:00Z"); date.setUTCDate(date.getUTCDate() + 1)) {
    const weekday = date.getUTCDay();
    if (!weekday) continue;
    const base = { onDate: date.toISOString().slice(0, 10), weekdays: "1,2,3,4,5,6", weekParity: "all" as const };
    rows.push({ ...base, title: "Пара", kind: "class", startMin: 480, endMin: 710 }, { ...base, title: "Пара", kind: "class", startMin: 780, endMin: 1010 });
    if (weekday === 1) rows.push({ ...base, title: "Запись в Корео", kind: "work", startMin: 540, endMin: 600 });
  }
  return rows;
}
