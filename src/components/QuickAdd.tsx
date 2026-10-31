import { SharedAccess } from "./SharedAccess";
import { AppSelect, DateField } from "@/components/FormControls";
import { minorUnits, normalizeCurrency } from "@contracts/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Plus } from "lucide-react";
import { Modal } from "./Modal";
import { trpc } from "@/providers/trpc";
import { localDayKey, minutesToTime, type PlannerData, type QuickAddKind } from "@/lib/planner";
import { moduleMutation } from "./ModuleKit";

const kindLabels: Record<QuickAddKind, string> = {
  task: "Задача",
  expense: "Трата",
  income: "Доход",
  note: "Заметка",
};

export function QuickAdd({ kind, data, onClose }: { kind: QuickAddKind; data: PlannerData; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [activeKind, setActiveKind] = useState<QuickAddKind>(kind);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Прочее");
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [estimateMin, setEstimateMin] = useState(30);
  const [workspaceId, setWorkspaceId] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [scheduleItemId, setScheduleItemId] = useState("");
  const [isMit, setIsMit] = useState(false);
  const [error, setError] = useState("");
  const [recordId, setRecordId] = useState(() => crypto.randomUUID());
  const titleRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const scheduleOptions = data.schedule.filter(item => !item.onDate || item.onDate === due);

  useEffect(() => setActiveKind(kind), [kind]);

  const refresh = async () => {
    await utils.planner.bootstrap.invalidate();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (pending) return;
    try {
      setPending(true);
      if (activeKind === "task") {
        if (!title.trim()) throw new Error("Напишите, что нужно сделать");
        await moduleMutation("planner.tasks.create", { id: recordId, title: title.trim(), due: due || undefined, estimateMin, projectId: projectId || null, scheduleItemId: scheduleItemId || null, workspaceId: data.projects.find(project => project.id === projectId)?.workspaceId ?? (workspaceId || null), isMit, importance: isMit ? 3 : 2 });
        await refresh(); setTitle(""); setRecordId(crypto.randomUUID()); titleRef.current?.focus(); return;
      }
      if (activeKind === "note") {
        if (!note.trim()) throw new Error("Напишите хотя бы одну мысль");
        const date = localDayKey(); const existing = data.journal.find(entry => entry.date === date);
        await moduleMutation("planner.journal.save", { id: existing?.id ?? recordId, operationId: recordId, date, mood: existing?.mood ?? 3, energy: existing?.energy ?? 3, done: existing?.done ?? "", failed: existing?.failed ?? "", insight: existing?.insight ?? "", gratitude: existing?.gratitude ?? "", text: existing?.text ? `${existing.text}\n\n${note.trim()}` : note.trim(), tags: existing?.tags ?? "заметка" });
      } else {
        const value = minorUnits(amount.replace(",", "."));
        if (value <= 0) throw new Error("Введите сумму больше нуля");
        await moduleMutation("planner.money.add", { id: recordId, kind: activeKind, amount: value, currency: normalizeCurrency(data.settings?.currency), category, note: note.trim() || undefined, projectId: projectId || null, happenedAt: new Date() });
      }
      await refresh(); onClose();
    } catch (error) { setError((error as Error).message); }
    finally { setPending(false); }
  };

  return (
    <Modal title="Быстрое добавление" onClose={onClose}>
      <div className="segmented" role="tablist" aria-label="Тип записи">
        {(Object.keys(kindLabels) as QuickAddKind[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={activeKind === item}
            className={activeKind === item ? "active" : ""}
            onClick={() => { setActiveKind(item); setError(""); }}
          >
            {kindLabels[item]}
          </button>
        ))}
      </div>
      <form className="form-grid" style={{ marginTop: 20 }} onSubmit={submit}>
        {activeKind === "task" && (
          <>
            <div className="field">
              <label htmlFor="quick-task-title">Что нужно сделать?</label>
              <input ref={titleRef} id="quick-task-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, отправить оффер" maxLength={240} />
            </div>
            <SharedAccess id="quick-task-access" data={data} value={workspaceId} onChange={setWorkspaceId} projectId={projectId} />
            <button type="button" className="text-button quick-task-details" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}>{detailsOpen ? "Скрыть детали" : "Добавить срок, проект и оценку"}</button>
            {detailsOpen && <>
            <div className="form-row">
              <div className="field">
                <label htmlFor="quick-task-date">Срок</label>
                <DateField id="quick-task-date" className="input" value={due} onChange={(event) => { const next = event.target.value; setDue(next); const linkedEvent = data.schedule.find(item => item.id === scheduleItemId); if (linkedEvent?.onDate && linkedEvent.onDate !== next) setScheduleItemId(""); }} />
              </div>
              <div className="field">
                <label htmlFor="quick-task-estimate">Оценка</label>
                <AppSelect id="quick-task-estimate" className="select" value={estimateMin} onChange={(event) => setEstimateMin(Number(event.target.value))}>
                  {[15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} минут</option>)}
                </AppSelect>
              </div>
            </div>
            <div className="field">
              <label htmlFor="quick-task-project">Проект</label>
              <AppSelect id="quick-task-project" className="select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">Без проекта</option>
                {data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </AppSelect>
            </div>
            {!workspaceId && !data.projects.find(project => project.id === projectId)?.workspaceId && <div className="field"><label htmlFor="quick-task-schedule">Добавить прямо в событие</label><AppSelect id="quick-task-schedule" className="select" value={scheduleItemId} onChange={event => setScheduleItemId(event.target.value)}><option value="">Без привязки к расписанию</option>{scheduleOptions.map(item => <option key={item.id} value={item.id}>{item.title} · {item.onDate ?? `повтор ${item.weekdays}`} · {minutesToTime(item.startMin)}</option>)}</AppSelect><small className="muted">Задача появится внутри подходящего занятия на главной.</small></div>}
            <div className="switch-row">
              <span className="small"><strong>Главная задача дня</strong><br /><span className="muted">Войдёт в три MIT на «Сегодня»</span></span>
              <button className={`switch ${isMit ? "on" : ""}`} type="button" role="switch" aria-checked={isMit} onClick={() => setIsMit(!isMit)} aria-label="Главная задача дня" />
            </div>
            </>}
          </>
        )}

        {(activeKind === "expense" || activeKind === "income") && (
          <>
            <div className="field">
          <label htmlFor="quick-money-amount">Сумма, {data.settings?.currency ?? "TJS"}</label>
              <input id="quick-money-amount" className="input number" style={{ fontSize: 28, fontWeight: 800 }} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))} placeholder="0" />
            </div>
            <div className="field">
              <label htmlFor="quick-money-category">Категория</label>
              <AppSelect id="quick-money-category" className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
                {(activeKind === "income" ? ["Проекты", "Агентство", "Прочее"] : ["Еда", "Обед", "Транспорт", "Учёба", "Подписки", "Проекты", "Прочее"]).map((item) => <option key={item}>{item}</option>)}
              </AppSelect>
            </div>
            {(
              <div className="field">
                <label htmlFor="quick-money-project">Связать с проектом <span className="muted">(необязательно)</span></label>
                <AppSelect id="quick-money-project" className="select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">Без проекта</option>
                  {data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </AppSelect>
              </div>
            )}
            <div className="field">
              <label htmlFor="quick-money-note">Комментарий <span className="muted">(необязательно)</span></label>
              <input id="quick-money-note" className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder={activeKind === "expense" ? "На что потратили?" : "Откуда доход?"} />
            </div>
          </>
        )}

        {activeKind === "note" && (
          <div className="field">
            <label htmlFor="quick-note">Мысль дня</label>
            <textarea id="quick-note" className="textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Что хочется записать, чтобы не потерять?" maxLength={10000} />
          </div>
        )}

        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" type="submit" disabled={pending}>
          {pending ? <Check size={18} /> : <Plus size={18} />}
          {pending ? "Сохраняем…" : `Добавить: ${kindLabels[activeKind].toLowerCase()}`}
        </button>
      </form>
    </Modal>
  );
}
