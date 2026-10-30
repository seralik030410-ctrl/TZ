import { ChevronLeft, ChevronRight } from "lucide-react";
import { localDayKey } from "@/lib/planner";

export function MonthNavigator({ value, onChange }: { value: string | null; onChange: (value: string | null) => void }) {
  const current = localDayKey().slice(0, 7);
  const move = (offset: number) => {
    const [year, month] = (value ?? current).split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    onChange(date.toISOString().slice(0, 7));
  };
  return <div className="action-row" style={{ alignItems: "center", margin: "16px 0" }} aria-label="Просмотр по месяцам">
    <button className="icon-button" type="button" aria-label="Предыдущий месяц" onClick={() => move(-1)}><ChevronLeft size={18} /></button>
    <strong aria-live="polite">{value ? new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`)) : "Все месяцы"}</strong>
    <button className="icon-button" type="button" aria-label="Следующий месяц" onClick={() => move(1)}><ChevronRight size={18} /></button>
    <button type="button" className="text-button" onClick={() => onChange(current)}>Этот месяц</button>
    <button type="button" className="text-button" onClick={() => onChange(null)}>Все месяцы</button>
  </div>;
}
