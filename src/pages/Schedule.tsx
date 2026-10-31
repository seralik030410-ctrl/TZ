import { AppSelect, DateField } from "@/components/FormControls";
import { RecordForm, options } from "@/components/ModuleKit";
import { exceptionSchema, scheduleForDay } from "@contracts/schedule";
import { addCalendarDays, minutesInZone } from "@contracts/shared";
import { useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";
import { CalendarDays, Clock3, Coffee, GraduationCap, MapPin, Plus, Trash2, BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import { getFreeWindows } from "@contracts/planning";
import { Modal } from "@/components/Modal";
import { trpc } from "@/providers/trpc";
import { getUserTimezone, formatDuration, localDayKey, minutesToTime, timeToMinutes, type LayoutContext } from "@/lib/planner";

const weekdays = [
  { value: 1, short: "Пн", long: "Понедельник" },
  { value: 2, short: "Вт", long: "Вторник" },
  { value: 3, short: "Ср", long: "Среда" },
  { value: 4, short: "Чт", long: "Четверг" },
  { value: 5, short: "Пт", long: "Пятница" },
  { value: 6, short: "Сб", long: "Суббота" },
  { value: 7, short: "Вс", long: "Воскресенье" },
];

export default function Schedule() {
  const { data } = useOutletContext<LayoutContext>();
  const utils = trpc.useUtils();
  const currentWeekday = new Date(`${localDayKey()}T12:00:00Z`).getUTCDay() || 7;
  const [selected, setSelected] = useState(currentWeekday);
  const [viewDay, setViewDay] = useState(localDayKey());
  const sharedBusy = trpc.sharing.busy.useQuery({ day: viewDay }, { enabled: data.workspaces.length > 0 });
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<LayoutContext["data"]["schedule"][number] | null>(null);
  const [exceptionFor, setExceptionFor] = useState<string | null>(null);
  const saveException = trpc.calendar.saveException.useMutation();
  const removeException = trpc.calendar.removeException.useMutation({ onSuccess: () => utils.planner.bootstrap.invalidate(), onError: e => toast.error(e.message) });
  const items = scheduleForDay(data.schedule, data.scheduleExceptions ?? [], viewDay);
  const windows = getFreeWindows(data.settings?.workStartMin ?? 480, data.settings?.workEndMin ?? 1320, items.map((item) => ({ id: item.id, startMin: item.startMin, endMin: item.endMin, fixed: true })));
  const remove = trpc.planner.schedule.remove.useMutation({
    onSuccess: async () => { await utils.planner.bootstrap.invalidate(); toast.success("Событие убрано из шаблона"); },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="page">
      <div className="page-header">
        <div><p className="eyebrow">Фиксированный каркас недели</p><h1>Расписание</h1><p className="subtitle">События повторяются по выбранным дням бессрочно. Для зарядки выберите каждый день; для изменения одного дня используйте исключение на дату.</p></div>
        <button className="button button-primary quick-add-desktop" type="button" onClick={() => setAddOpen(true)}><Plus size={17} />Добавить событие</button>
      </div>

      <div className="field"><label htmlFor="schedule-view-date">Показать расписание на дату</label><DateField id="schedule-view-date" className="input" value={viewDay} onChange={e => { setViewDay(e.target.value); setSelected(new Date(`${e.target.value}T12:00:00Z`).getUTCDay() || 7); }} /></div>
      <div className="week-grid" role="tablist" aria-label="День недели">
        {weekdays.map((day) => (
          <button key={day.value} type="button" role="tab" aria-selected={selected === day.value} className={`week-day ${selected === day.value ? "today" : ""}`} onClick={() => { setViewDay(addCalendarDays(viewDay, day.value - selected)); setSelected(day.value); }} style={{ border: 0 }}>
            <strong>{day.short}</strong><span>{scheduleForDay(data.schedule, data.scheduleExceptions ?? [], addCalendarDays(viewDay, day.value - selected)).length} соб.</span>
          </button>
        ))}
      </div>

      <div className="dashboard-grid" style={{ marginTop: 18 }}>
        <section className="card span-8">
          <div className="section-title" style={{ marginTop: 0 }}><div><p className="eyebrow">{viewDay}</p><h2>{weekdays.find((day) => day.value === selected)?.long}</h2></div><button className="icon-button" type="button" onClick={() => setAddOpen(true)} aria-label="Добавить событие"><Plus size={20} /></button></div>
          {items.length === 0 && <div className="empty-state"><CalendarDays size={30} /><strong>Свободный день</strong><p>Добавьте только фиксированные события. Гибкие блоки живут в проектах.</p><button className="button button-primary" type="button" onClick={() => setAddOpen(true)}>Добавить событие</button></div>}
          <div className="timeline">
            {items.map((item) => (
              <div className="timeline-row" key={item.id}>
                <div className="timeline-time">{minutesToTime(item.startMin)}</div>
                <div className="timeline-event fixed">
                  <strong>{item.title}</strong>
                  <p className="micro muted">{item.onDate ? `Только ${item.onDate}` : item.weekParity === "even" ? "Чётные недели" : item.weekParity === "odd" ? "Нечётные недели" : "Каждую неделю · бессрочно"}</p>
                  <div className="action-row"><button className="text-button" onClick={() => setEditing(item)}>Изменить</button><button className="text-button" onClick={() => setExceptionFor(item.id)}>Исключение на дату</button></div>
                  <span>{minutesToTime(item.endMin)} · {formatDuration(item.endMin - item.startMin)}{item.location ? ` · ${item.location}` : ""}</span>
                  <button className="icon-button" style={{ position: "absolute", top: 9, right: 8, width: 38, height: 38 }} type="button" onClick={() => { if (window.confirm(`Убрать «${item.title}» из недельного шаблона?`)) remove.mutate({ id: item.id }); }} aria-label={`Удалить ${item.title}`}><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card span-4">
          <p className="eyebrow">Автоматический расчёт</p>
          <div className="section-title"><h2>Свободные окна</h2><span className="badge badge-info">{windows.length}</span></div>
          {windows.length === 0 && <p className="muted small">На этот день окон не осталось. Проверьте, не слишком ли плотный каркас.</p>}
          <div className="plain-list">
            {windows.map((window) => <div className="list-row" key={window.startMin}><Clock3 size={18} color="var(--accent)" /><div className="list-row-main"><strong>{minutesToTime(window.startMin)}–{minutesToTime(window.endMin)}</strong><span>Можно использовать для проекта</span></div><span className="list-row-value">{formatDuration(window.endMin - window.startMin)}</span></div>)}
          </div>
          <div className="accent-card" style={{ borderRadius: 18, padding: 14, marginTop: 16 }}><p className="small" style={{ margin: 0 }}>Блоки короче 30 минут не создаются — так в дне остаётся меньше лишней суеты.</p></div>
        </section>
      </div>

      {data.workspaces.length > 0 && <section className="card" style={{ marginTop: 18 }}><div className="section-title" style={{ marginTop: 0 }}><h2>Занятость участников</h2><span className="badge">Общее</span></div><p className="small muted">{viewDay} · Видно только время занятости. Названия и детали личных событий скрыты.</p>{sharedBusy.isLoading ? <p className="small muted">Загружаем занятость…</p> : sharedBusy.error ? <p className="small muted" role="status">Не удалось проверить занятость. <button className="text-button" onClick={() => void sharedBusy.refetch()}>Повторить</button></p> : sharedBusy.data?.length ? <div className="plain-list">{sharedBusy.data.map(block => <div className="list-row" key={block.id}><Clock3 size={18} color="var(--text-soft)" /><div className="list-row-main"><strong>Занято</strong><span>{minutesToTime(minutesInZone(block.start, getUserTimezone()))}–{minutesToTime(minutesInZone(block.end, getUserTimezone()))}</span></div></div>)}</div> : <p className="small muted">На выбранную дату занятых интервалов нет.</p>}</section>}
      <section className="card" style={{ marginTop: 18 }}><h2>Исключения на дату</h2>{(data.scheduleExceptions ?? []).length ? data.scheduleExceptions.map(exception => <div className="list-row" key={exception.id}><div className="list-row-main"><strong>{data.schedule.find(s => s.id === exception.itemId)?.title ?? "Событие"}</strong><span>{exception.date} · {exception.action === "cancel" ? "Отменено" : `${minutesToTime(exception.startMin ?? 0)}–${minutesToTime(exception.endMin ?? 0)}`}</span></div><button className="icon-button" aria-label="Удалить исключение" onClick={() => removeException.mutate({ id: exception.id })}><Trash2 size={16} /></button></div>) : <p className="small muted">Отмена или перенос на отдельную дату не меняют недельный шаблон.</p>}</section>
      {exceptionFor && <RecordForm title="Исключение из расписания" initial={{ itemId: exceptionFor }} fields={[{ key: "date", label: "Дата", type: "date", value: localDayKey(), required: true }, { key: "action", label: "Что изменить", options: options({ cancel: "Отменить на эту дату", move: "Перенести время на эту дату" }), value: "cancel", required: true }, { key: "startMin", label: "Новое начало", type: "time", hint: "Для переноса времени" }, { key: "endMin", label: "Новое окончание", type: "time" }]} schema={exceptionSchema} onClose={() => setExceptionFor(null)} onSave={async value => { await saveException.mutateAsync(exceptionSchema.parse(value)); await utils.planner.bootstrap.invalidate(); }} />}
      {editing && <ScheduleModal initial={editing} onClose={() => setEditing(null)} defaultWeekday={selected} />}
      {addOpen && <ScheduleModal onClose={() => setAddOpen(false)} defaultWeekday={selected} />}
    </div>
  );
}

function ScheduleModal({ onClose, defaultWeekday, initial }: { onClose: () => void; defaultWeekday: number; initial?: LayoutContext["data"]["schedule"][number] }) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [onDate, setOnDate] = useState(initial?.onDate ?? "");
  const [once, setOnce] = useState(Boolean(initial?.onDate));
  const [kind, setKind] = useState<"class" | "lunch" | "work" | "meeting" | "sleep">((initial?.kind as "class") ?? "class");
  const [start, setStart] = useState(minutesToTime(initial?.startMin ?? 540));
  const [end, setEnd] = useState(minutesToTime(initial?.endMin ?? 630));
  const [location, setLocation] = useState(initial?.location ?? "");
  const [weekParity, setWeekParity] = useState<"all" | "even" | "odd">((initial?.weekParity as "all") ?? "all");
  const [selectedDays, setSelectedDays] = useState<number[]>(initial?.weekdays.split(",").map(Number) ?? [defaultWeekday]);
  const [error, setError] = useState("");
  const create = trpc.calendar.saveEvent.useMutation({
    onSuccess: async () => { await utils.planner.bootstrap.invalidate(); toast.success("Событие добавлено в шаблон"); onClose(); },
    onError: (mutationError) => setError(mutationError.message),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError("Введите название события");
    if (!selectedDays.length) return setError("Выберите хотя бы один день недели");
    if (timeToMinutes(end) <= timeToMinutes(start)) return setError("Конец должен быть позже начала");
    if (once && !onDate) return setError("Выберите дату события");
    create.mutate({ id: initial?.id ?? crypto.randomUUID(), mode: initial ? "update" : "create", onDate: once ? onDate : null, weekParity, title: title.trim(), kind, startMin: timeToMinutes(start), endMin: timeToMinutes(end), weekdays: selectedDays.slice().sort((a, b) => a - b).join(","), location: location || undefined });
  };
  return (
    <Modal title={initial ? "Изменить событие" : "Новое событие"} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <div className="field"><label htmlFor="schedule-repeat">Повтор</label><AppSelect id="schedule-repeat" className="select" value={once ? "once" : "repeat"} onChange={e => setOnce(e.target.value === "once")}><option value="repeat">По дням недели — бессрочно</option><option value="once">Один раз на дату</option></AppSelect></div>{once && <div className="field"><label htmlFor="schedule-on-date">Дата события</label><DateField id="schedule-on-date" className="input" required value={onDate} onChange={e => setOnDate(e.target.value)} /></div>}
        <div className="field"><label htmlFor="schedule-parity">Повтор по неделям</label><AppSelect id="schedule-parity" className="select" value={weekParity} onChange={e => setWeekParity(e.target.value as typeof weekParity)}><option value="all">Каждую неделю</option><option value="even">Чётные недели</option><option value="odd">Нечётные недели</option></AppSelect></div>
        <div className="field"><label htmlFor="schedule-title">Название</label><input id="schedule-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, иностранный язык" /></div>
        <div className="action-row"><button type="button" className="button button-ghost" onClick={() => { setSelectedDays([1,2,3,4,5,6,7]); setWeekParity("all"); }}>Каждый день</button><button type="button" className="button button-ghost" onClick={() => { setSelectedDays([1,2,3,4,5]); setWeekParity("all"); }}>По будням</button></div><p className="small muted">Повтор действует без даты окончания, пока вы не измените или не уберёте событие.</p>
        <div className="segmented">
          <button type="button" className={kind === "class" ? "active" : ""} onClick={() => setKind("class")}><GraduationCap size={15} />Пара</button>
          <button type="button" className={kind === "lunch" ? "active" : ""} onClick={() => setKind("lunch")}><Coffee size={15} />Обед</button>
          <button type="button" className={kind === "work" ? "active" : ""} onClick={() => setKind("work")}><BriefcaseBusiness size={15} />Работа</button>
        </div>
        <div className="form-row">
          <div className="field"><label htmlFor="schedule-start">Начало</label><input id="schedule-start" className="input" type="time" value={start} onChange={(event) => setStart(event.target.value)} /></div>
          <div className="field"><label htmlFor="schedule-end">Конец</label><input id="schedule-end" className="input" type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
        </div>
        <div className="field"><span className="field-label">Дни недели</span><div className="week-grid">{weekdays.map((day) => <button key={day.value} className={`week-day ${selectedDays.includes(day.value) ? "today" : ""}`} style={{ border: 0 }} type="button" onClick={() => setSelectedDays((days) => days.includes(day.value) ? days.filter((value) => value !== day.value) : [...days, day.value])}><strong>{day.short}</strong></button>)}</div></div>
        <div className="field"><label htmlFor="schedule-location">Место <span className="muted">(необязательно)</span></label><div style={{ position: "relative" }}><MapPin size={17} style={{ position: "absolute", left: 14, top: 17, color: "var(--text-soft)" }} /><input id="schedule-location" className="input" style={{ paddingLeft: 42 }} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Аудитория или адрес" /></div></div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" type="submit" disabled={create.isPending}>{create.isPending ? "Добавляем…" : "Добавить в расписание"}</button>
      </form>
    </Modal>
  );
}
