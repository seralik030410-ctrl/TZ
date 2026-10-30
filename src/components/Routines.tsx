import { AppSelect, DateField } from "@/components/FormControls";
import { useState } from "react";
import { toast } from "sonner";
import { Modal } from "./Modal";
import { trpc } from "@/providers/trpc";
import { addCalendarDays } from "@contracts/shared";
import { localDayKey, type PlannerData } from "@/lib/planner";

const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export function DayClosureHistory() {
  const query = trpc.routines.list.useQuery();
  const rows = query.data?.closures.slice().sort((a, b) => b.day.localeCompare(a.day)) ?? [];
  if (!rows.length) return null;
  return <section className="card" style={{ marginBottom: 18 }}><h2>Итоги завершённых дней</h2>{rows.map(row => <details key={row.day}><summary style={{ padding: "12px 0", cursor: "pointer" }}>{row.day}</summary><p style={{ whiteSpace: "pre-wrap" }}>{row.note}</p></details>)}</section>;
}
export function RoutineTemplates() {
  const [open, setOpen] = useState(false);
  return <><button className="button button-ghost" onClick={() => setOpen(true)}>Шаблоны и повторы</button>{open && <TemplatesDialog onClose={() => setOpen(false)} />}</>;
}
function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils(); const query = trpc.routines.list.useQuery();
  const [title, setTitle] = useState(""); const [mode, setMode] = useState("template");
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5, 6, 7]);
  const [startsOn, setStartsOn] = useState(localDayKey()); const [endsOn, setEndsOn] = useState("");
  const [id, setId] = useState(() => crypto.randomUUID());
  const refresh = async () => { await utils.routines.list.invalidate(); await utils.planner.bootstrap.invalidate(); };
  const save = trpc.routines.save.useMutation({ onSuccess: async () => { await refresh(); setTitle(""); setId(crypto.randomUUID()); toast.success("Шаблон сохранён"); }, onError: e => toast.error(e.message) });
  const remove = trpc.routines.remove.useMutation({ onSuccess: refresh, onError: e => toast.error(e.message) });
  const useTemplate = trpc.routines.useTemplate.useMutation({ onSuccess: async () => { await refresh(); toast.success("Задача добавлена на сегодня"); }, onError: e => toast.error(e.message) });
  return <Modal title="Шаблоны и повторяющиеся задачи" onClose={onClose}><form className="form-grid" onSubmit={e => { e.preventDefault(); save.mutate({ id, title, weekdays: mode === "template" ? null : weekdays.slice().sort().join(","), startsOn, endsOn: endsOn || null, paused: false }); }}><p className="small muted">Шаблон добавляется по кнопке. Повтор создаёт отдельную задачу на текущий день. Еженедельные задачи также появляются заранее на ближайшие 7 дней. Пропущенные дни не заполняются задним числом.</p><div className="field"><label htmlFor="routine-title">Название</label><input id="routine-title" className="input" required maxLength={240} value={title} onChange={e => setTitle(e.target.value)} placeholder="Например, утренняя зарядка" /></div><div className="field"><label htmlFor="routine-mode">Как использовать</label><AppSelect className="select" id="routine-mode" value={mode} onChange={e => { setMode(e.target.value); if (e.target.value === "daily") setWeekdays([1, 2, 3, 4, 5, 6, 7]); if (e.target.value === "workdays") setWeekdays([1, 2, 3, 4, 5]); }}><option value="template">Шаблон — добавлять вручную</option><option value="daily">Каждый день</option><option value="workdays">По будням</option><option value="custom">По выбранным дням</option></AppSelect></div>{mode !== "template" && <><div className="week-grid">{days.map((day, index) => <button className={`week-day ${weekdays.includes(index + 1) ? "today" : ""}`} type="button" aria-pressed={weekdays.includes(index + 1)} key={day} onClick={() => { setMode("custom"); setWeekdays(current => current.includes(index + 1) ? current.filter(d => d !== index + 1) : [...current, index + 1]); }}>{day}</button>)}</div><div className="form-row"><div className="field"><label htmlFor="routine-start">Начать</label><DateField className="input" id="routine-start" required value={startsOn} onChange={e => setStartsOn(e.target.value)} /></div><div className="field"><label htmlFor="routine-end">Закончить — необязательно</label><DateField className="input" id="routine-end" min={startsOn} value={endsOn} onChange={e => setEndsOn(e.target.value)} /></div></div><p className="small muted">Без даты окончания повтор действует бессрочно. Его можно приостановить в любой момент.</p></>}<button className="button button-primary" disabled={save.isPending || mode !== "template" && !weekdays.length}>Сохранить</button></form><div className="plain-list" style={{ marginTop: 24 }}>{query.isError && <p role="alert">Не удалось загрузить шаблоны. <button className="text-button" onClick={() => void query.refetch()}>Повторить</button></p>}{query.data?.templates.map(t => <div className="list-row" key={t.id}><div className="list-row-main"><strong>{t.title}</strong><span>{t.weekdays ? t.paused ? "Повтор приостановлен" : t.weekdays.split(",").map(d => days[Number(d) - 1]).join(", ") : "Шаблон"}{t.weekdays && ` · ${t.endsOn ? `до ${t.endsOn}` : "бессрочно"}`}</span><div className="action-row"><button type="button" className="text-button" disabled={useTemplate.isPending} onClick={() => useTemplate.mutate({ id: t.id, operationId: crypto.randomUUID(), day: localDayKey() })}>Добавить сегодня</button>{t.weekdays && <button type="button" className="text-button" disabled={save.isPending} onClick={() => save.mutate({ ...t, paused: !t.paused })}>{t.paused ? "Возобновить" : "Пауза"}</button>}<button type="button" className="text-button" disabled={remove.isPending} onClick={() => remove.mutate({ id: t.id })}>Убрать шаблон</button></div></div></div>)}</div></Modal>;
}

export function CloseDay({ data }: { data: PlannerData }) {
  const [open, setOpen] = useState(false); const query = trpc.routines.list.useQuery();
  const today = localDayKey(); const closure = query.data?.closures.find(c => c.day === today);
  return <><button className="button button-ghost" onClick={() => setOpen(true)}>{closure ? "Итог дня сохранён" : "Завершить день"}</button>{open && (closure ? <Modal title="Итог дня" onClose={() => setOpen(false)}><p className="subtitle">{today} · день завершён</p><p style={{ whiteSpace: "pre-wrap" }}>{closure.note || "Итог сохранён без заметки."}</p></Modal> : <CloseDayDialog data={data} onClose={() => setOpen(false)} />)}</>;
}
function CloseDayDialog({ data, onClose }: { data: PlannerData; onClose: () => void }) {
  const today = localDayKey(); const utils = trpc.useUtils();
  const unfinished = data.tasks.filter(t => t.status !== "done" && t.due && t.due <= today && !t.recurrence);
  const [selected, setSelected] = useState(unfinished.map(t => t.id)); const [targetDay, setTargetDay] = useState(addCalendarDays(today, 1)); const [note, setNote] = useState("");
  const close = trpc.routines.closeDay.useMutation({ onSuccess: async () => { await utils.planner.bootstrap.invalidate(); await utils.routines.list.invalidate(); toast.success("День завершён. Выбранные задачи перенесены"); onClose(); }, onError: e => toast.error(e.message) });
  const done = data.tasks.filter(t => t.completedAt && localDayKey(t.completedAt) === today).length;
  const minutes = data.timeLogs.filter(t => localDayKey(t.start) === today).reduce((sum, t) => sum + t.minutes, 0);
  return <Modal title="Завершить день" onClose={onClose}><form className="form-grid" onSubmit={e => { e.preventDefault(); close.mutate({ day: today, targetDay, moveIds: selected, note }); }}><p>Сегодня завершено задач: <strong>{done}</strong>. Фокус: <strong>{minutes} мин</strong>.</p><div className="field"><label htmlFor="close-note">Что получилось и что учесть завтра?</label><textarea className="textarea" id="close-note" maxLength={5000} value={note} onChange={e => setNote(e.target.value)} /></div><h3>Перенести незавершённое</h3><p className="small muted">Без отметки задача сохранит прежний срок. Повторяющиеся задачи остаются в истории своего дня — завтра появится отдельная.</p>{unfinished.map(t => <label className="list-row" key={t.id}><input type="checkbox" checked={selected.includes(t.id)} onChange={e => setSelected(current => e.target.checked ? [...current, t.id] : current.filter(id => id !== t.id))} /><span>{t.title}</span></label>)}{!unfinished.length && <p className="muted">Незавершённых задач со сроком на сегодня нет.</p>}<div className="field"><label htmlFor="close-target">Новый срок выбранных задач</label><DateField className="input" id="close-target" min={addCalendarDays(today, 1)} required value={targetDay} onChange={e => setTargetDay(e.target.value)} /></div><button className="button button-primary" disabled={close.isPending}>{close.isPending ? "Сохраняем…" : "Сохранить итог и завершить день"}</button></form></Modal>;
}
