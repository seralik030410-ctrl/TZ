import { useState, type FormEvent } from "react";
import { Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Modal } from "./Modal";
import { AppSelect } from "./FormControls";
import type { PlannerData } from "@/lib/planner";

export function ScheduleTasks({ data, eventId, day }: { data: PlannerData; eventId: string; day: string }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const event = data.schedule.find(item => item.id === eventId);
  const [chooseProject, setChooseProject] = useState(false);
  const link = trpc.planner.schedule.linkProject.useMutation({ onSuccess: async () => { await utils.planner.bootstrap.invalidate(); setChooseProject(false); }, onError: error => toast.error(error.message) });
  const update = trpc.planner.tasks.update.useMutation({ onSuccess: () => utils.planner.bootstrap.invalidate(), onError: e => toast.error(e.message) });
  const roots = data.tasks.filter(t => !t.parentId && ((t.scheduleItemId === eventId && (!t.due || t.due === day)) || (!!event?.projectId && t.projectId === event.projectId && (!t.due || t.due === day))));
  return <div className="event-checklist">
    {event?.projectId && <p className="small muted">{data.projects.find(p => p.id === event.projectId)?.name ?? "Проект"} · отмечайте выполненные задачи здесь</p>}
    {roots.map(root => <div className="event-checklist-group" key={root.id}>
      {[root, ...data.tasks.filter(t => t.parentId === root.id)].map(t => <div className={`event-checklist-row ${t.parentId ? "is-child" : ""}`} key={t.id}>
        <button type="button" className={`task-check ${t.status === "done" ? "checked" : ""}`} disabled={update.isPending} aria-label={`${t.status === "done" ? "Вернуть" : "Выполнить"} ${t.title}`} onClick={() => update.mutate({ id: t.id, status: t.status === "done" ? "plan" : "done" })}>{t.status === "done" && <Check size={14} />}</button>
        <span className={t.status === "done" ? "completed-step" : ""}>{t.title}</span>
      </div>)}
    </div>)}
    <button type="button" className="text-button event-add-task" onClick={() => setOpen(true)}><Plus size={14} />Задача внутри занятия</button>
    <button type="button" className="text-button event-add-task" onClick={() => setChooseProject(!chooseProject)}>{event?.projectId ? "Изменить проект" : "Показать задачи проекта"}</button>
    {chooseProject && <div className="field"><label htmlFor={`event-project-${eventId}`}>Задачи внутри этого занятия</label><AppSelect id={`event-project-${eventId}`} value={event?.projectId ?? ""} disabled={link.isPending} onChange={e => link.mutate({ id: eventId, projectId: e.target.value || null })}><option value="">Без проекта</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.workspaceId ? " · Общее" : ""}</option>)}</AppSelect></div>}
    {open && <EventTaskDialog data={data} eventId={eventId} day={day} onClose={() => setOpen(false)} />}
  </div>;
}

function EventTaskDialog({ data, eventId, day, onClose }: { data: PlannerData; eventId: string; day: string; onClose: () => void }) {
  const [existing, setExisting] = useState("");
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState("");
  const [error, setError] = useState("");
  const [id] = useState(() => crypto.randomUUID());
  const utils = trpc.useUtils();
  const create = trpc.planner.tasks.create.useMutation();
  const update = trpc.planner.tasks.update.useMutation();
  const busy = create.isPending || update.isPending;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    try {
      if (existing) await update.mutateAsync({ id: existing, scheduleItemId: eventId, due: day });
      else await create.mutateAsync({ id, title: title.trim(), due: day, scheduleItemId: eventId, subtasks: steps.split("\n").map(s => s.trim()).filter(Boolean).map(title => ({ id: crypto.randomUUID(), title })) });
      await utils.planner.bootstrap.invalidate(); onClose(); toast.success("Задача добавлена внутрь занятия");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить задачу"); }
  };
  return <Modal title="Задача внутри занятия" onClose={onClose}><form className="form-grid" onSubmit={submit}>
    <p className="small muted">{day} · задача и её шаги займут место внутри этого занятия. Отдельное время в плане не добавится.</p>
    <div className="field"><label htmlFor="event-existing-task">Создать или выбрать задачу</label><AppSelect id="event-existing-task" value={existing} onChange={e => setExisting(e.target.value)}><option value="">Новая задача</option>{data.tasks.filter(t => !t.parentId && !t.workspaceId && t.status !== "done" && t.scheduleItemId !== eventId && !data.projects.find(p => p.id === t.projectId)?.workspaceId).map(t => <option value={t.id} key={t.id}>{t.title}</option>)}</AppSelect></div>
    {existing ? <p className="small muted">Все подзадачи перенесутся вместе с задачей. Прежние активные рабочие блоки будут убраны.</p> : <>
      <div className="field"><label htmlFor="event-task-title">Задача</label><input id="event-task-title" className="input" required maxLength={240} placeholder="Записать людей" value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div className="field"><label htmlFor="event-task-steps">Подзадачи — каждая с новой строки</label><textarea id="event-task-steps" className="textarea" value={steps} onChange={e => setSteps(e.target.value)} placeholder={'Записать первого человека\nЗаписать второго человека\nЗаписать третьего человека'} /><span className="micro muted">До 30 шагов. Можно отмечать каждого человека отдельно прямо в расписании.</span></div>
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Сохраняем…" : "Добавить внутрь занятия"}</button>
  </form></Modal>;
}
