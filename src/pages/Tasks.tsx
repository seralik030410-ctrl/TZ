import { AppSelect, DateField } from "@/components/FormControls";
import { useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";
import {
  CalendarDays,
  Check,
  CheckSquare2,
  Clock3,
  Edit3,
  GripVertical,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { TaskDragBoard } from "@/components/TaskDragBoard";
import { TaskInsights } from "@/components/TaskInsights";
import { RoutineTemplates } from "@/components/Routines";
import { moduleMutation } from "@/components/ModuleKit";
import { Modal } from "@/components/Modal";
import { trpc } from "@/providers/trpc";
import {
  dayLabel,
  formatDuration,
  localDayKey,
  projectColor,
  projectTypeLabel,
  type LayoutContext,
  type Task,
} from "@/lib/planner";
import { addCalendarDays } from "@contracts/shared";

type TaskView = "list" | "board" | "matrix";

export default function Tasks() {
  const { data, openQuickAdd } = useOutletContext<LayoutContext>();
  const utils = trpc.useUtils();
  const [view, setView] = useState<TaskView>("list");
  const [filter, setFilter] = useState("active");
  const [projectFilter, setProjectFilter] = useState("all");
  const [editing, setEditing] = useState<Task | null>(null);
  const [lastMove, setLastMove] = useState<string | null>(() => localStorage.getItem("ritm-last-task-move"));
  const [completedDay, setCompletedDay] = useState<string | null>(null);
  const today = localDayKey();
  const tomorrow = addCalendarDays(today, 1);

  const refresh = async () => { await utils.planner.bootstrap.invalidate(); };
  const update = trpc.planner.tasks.update.useMutation({
    onSuccess: async () => { await refresh(); setEditing(null); },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.planner.tasks.remove.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Задача перемещена в архив"); },
    onError: (error) => toast.error(error.message),
  });

  const toggle = (task: Task) => {
    update.mutate({ id: task.id, status: task.status === "done" ? "plan" : "done" }, {
      onSuccess: () => {
        if (task.status !== "done") { toast.success("Готово! Ещё один шаг сделан"); navigator.vibrate?.(25); }
      },
    });
  };
  const edit = (task: Task) => setEditing(task);
  const archive = (task: Task) => {
    if (window.confirm(`Убрать задачу «${task.title}» в архив?`)) remove.mutate({ id: task.id });
  };


  const filtered = useMemo(() => data.tasks.filter((task) => {
    if (completedDay && (!task.completedAt || localDayKey(task.completedAt) !== completedDay)) return false;
    if (projectFilter !== "all" && task.projectId !== projectFilter) return false;
    if (filter === "active" && task.status === "done") return false;
    if (filter === "done" && task.status !== "done") return false;
    if (filter === "today" && task.due !== today) return false;
    if (filter === "overdue" && !(task.status !== "done" && task.due && task.due < today)) return false;
    return true;
  }), [data.tasks, filter, projectFilter, today, completedDay]);

  const counts = {
    active: data.tasks.filter((task) => task.status !== "done").length,
    today: data.tasks.filter((task) => task.due === today && task.status !== "done").length,
    overdue: data.tasks.filter((task) => task.status !== "done" && task.due && task.due < today).length,
    done: data.tasks.filter((task) => task.status === "done").length,
  };

  return (
    <div className="page">
      <div className="page-header">
        <div><p className="eyebrow">Что движет день вперёд</p><h1>Задачи</h1><p className="subtitle">Сначала главное, потом всё остальное. Перетаскивайте карточки или меняйте статус внутри задачи.</p></div>
        <button className="button button-primary quick-add-desktop" type="button" onClick={() => openQuickAdd("task")}><Plus size={18} />Новая задача</button>
      </div>

      <div className="segmented" role="tablist" aria-label="Вид задач">
        <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} role="tab" aria-selected={view === "list"}>Список</button>
        <button type="button" className={view === "board" ? "active" : ""} onClick={() => setView("board")} role="tab" aria-selected={view === "board"}>Доска</button>
        <button type="button" className={view === "matrix" ? "active" : ""} onClick={() => setView("matrix")} role="tab" aria-selected={view === "matrix"}>Матрица</button>
      </div>
      {<div className="task-actions-toolbar">
        {lastMove && <button className="button button-ghost" onClick={async () => { try { await moduleMutation("planner.tasks.undoReorder", { operationId: lastMove }); setLastMove(null); localStorage.removeItem("ritm-last-task-move"); await refresh(); } catch (error) { toast.error((error as Error).message); } }}>Отменить перемещение</button>}
        <RoutineTemplates />
      </div>}
      <TaskInsights tasks={data.tasks.filter(t => projectFilter === "all" || t.projectId === projectFilter)} onSelect={day => { setCompletedDay(day); setFilter("done"); }} />
      {completedDay && <p className="small">Завершены {completedDay} <button className="text-button" onClick={() => setCompletedDay(null)}>Сбросить дату</button></p>}

      <div className="filter-row" aria-label="Фильтры задач">
        {[
          ["active", `Активные ${counts.active}`],
          ["today", `Сегодня ${counts.today}`],
          ["overdue", `Просрочено ${counts.overdue}`],
          ["done", `Готово ${counts.done}`],
        ].map(([value, label]) => <button key={value} className={`filter-chip ${filter === value ? "active" : ""}`} type="button" onClick={() => setFilter(value)}>{label}</button>)}
        <AppSelect className="select" style={{ width: "auto", minHeight: 42, borderRadius: 999 }} value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label="Фильтр по проекту">
          <option value="all">Все проекты</option>
          {data.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
        </AppSelect>
      </div>

      {filtered.length === 0 && (
        <section className="card empty-state"><CheckSquare2 size={32} /><strong>Здесь пока пусто</strong><p>{filter === "done" ? "Выполненные задачи появятся после первой отметки." : "Добавьте одну конкретную задачу — с неё начнётся порядок."}</p><button className="button button-primary" type="button" onClick={() => openQuickAdd("task")}><Plus size={17} />Добавить задачу</button></section>
      )}

      {(view === "list" || view === "board") && <TaskDragBoard key={filtered.map(t => `${t.id}:${t.position}:${t.status}:${t.updatedAt}`).join("|")} tasks={filtered} board={view === "board"} render={task => <TaskCard task={task} data={data} onToggle={toggle} onEdit={edit} onArchive={archive} compact={view === "board"} />} onMove={async (id, beforeId, status) => { const operationId = crypto.randomUUID(); const expectedPositions = data.tasks.filter(task => !task.isDeleted).map(({ id: taskId, position, status: currentStatus }) => ({ id: taskId, position, status: currentStatus as "plan" | "doing" | "done" })); await moduleMutation("planner.tasks.reorder", { operationId, id, beforeId, status, expectedPositions }); setLastMove(operationId); localStorage.setItem("ritm-last-task-move", operationId); if (navigator.onLine) await refresh(); }} />}

      {view === "matrix" && (
        <div className="matrix">
          {[
            { title: "Важно и срочно", match: (task: Task) => task.importance >= 2 && !!task.due && task.due <= tomorrow, tone: "danger-card" },
            { title: "Важно, не срочно", match: (task: Task) => task.importance >= 2 && (!task.due || task.due > tomorrow), tone: "accent-card" },
            { title: "Срочно, менее важно", match: (task: Task) => task.importance === 1 && !!task.due && task.due <= tomorrow, tone: "" },
            { title: "Можно позже", match: (task: Task) => task.importance === 1 && (!task.due || task.due > tomorrow), tone: "" },
          ].map((quadrant) => (
            <section className={`card matrix-quadrant ${quadrant.tone}`} key={quadrant.title}>
              <h3>{quadrant.title}</h3>
              <div className="task-list">
                {filtered.filter(quadrant.match).map((task) => <TaskCard key={task.id} task={task} data={data} onToggle={toggle} onEdit={edit} onArchive={archive} compact />)}
                {filtered.filter(quadrant.match).length === 0 && <p className="muted small">Пусто — и это нормально.</p>}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && <TaskEditor task={editing} data={data} onClose={() => setEditing(null)} onSave={(input) => update.mutate(input)} onSubtaskToggle={toggle} onAddSubtask={async (parent, title) => { await moduleMutation("planner.tasks.create", { id: crypto.randomUUID(), title, projectId: parent.projectId, stageId: parent.stageId, parentId: parent.id }); if (navigator.onLine) await refresh(); }} pending={update.isPending} />}
    </div>
  );
}

function TaskCard({ task, data, onToggle, onEdit, onArchive, compact = false }: {
  task: Task;
  data: LayoutContext["data"];
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onArchive: (task: Task) => void;
  compact?: boolean;
}) {
  const project = data.projects.find((item) => item.id === task.projectId);
  const subtasks = data.tasks.filter(item => item.parentId === task.id);
  const overdue = task.status !== "done" && task.due && task.due < localDayKey();
  return (
    <article className={`task-card ${task.status === "done" ? "done" : ""} ${task.parentId ? "subtask-card" : ""}`}>
      <button className={`task-check ${task.status === "done" ? "checked" : ""}`} type="button" onClick={() => onToggle(task)} aria-label={task.status === "done" ? `Вернуть задачу «${task.title}»` : `Выполнить задачу «${task.title}»`}>
        {task.status === "done" && <Check size={16} />}
      </button>
      <div className="task-content">
        <p className="task-title">{task.title}</p>
        <div className="task-meta">
          {task.isMit && <span className="mit-mark"><Star size={12} fill="currentColor" />Главная</span>}
          {project && <span><span className="dot" style={{ background: projectColor[project.type] }} />{project.name}</span>}
          {task.due && <span style={overdue ? { color: "var(--danger)" } : undefined}><CalendarDays size={12} />{dayLabel(task.due)}</span>}
          <span><Clock3 size={12} />{formatDuration(task.estimateMin)}</span>
          {task.dependsOn && <span>После: {data.tasks.find(item => item.id === task.dependsOn)?.title ?? "другой задачи"}</span>}
          {subtasks.length > 0 && <span>{subtasks.filter(item => item.status === "done").length}/{subtasks.length} шагов</span>}
          {task.parentId && <span>Шаг: {data.tasks.find(item => item.id === task.parentId)?.title ?? "задачи"}</span>}
          {!compact && task.flexibility === "optional" && <span>По желанию</span>}
        </div>
      </div>
        <div className="task-actions">
        <button className="icon-button" type="button" onClick={() => onEdit(task)} aria-label={`Изменить «${task.title}»`}><Edit3 size={16} /></button>
        {!compact && <button className="icon-button" type="button" onClick={() => onArchive(task)} aria-label={`Архивировать «${task.title}»`}><Trash2 size={16} /></button>}
        {compact && <GripVertical size={18} color="var(--text-soft)" aria-hidden="true" />}
      </div>
    </article>
  );
}

function TaskEditor({ task, data, onClose, onSave, onSubtaskToggle, onAddSubtask, pending }: {
  task: Task;
  data: LayoutContext["data"];
  onClose: () => void;
  onSave: (input: {
    id: string;
    title?: string;
    notes?: string | null;
    due?: string | null;
    estimateMin?: number;
    importance?: number;
    projectId?: string | null;
    dependsOn?: string | null;
    status?: "plan" | "doing" | "done";
    isMit?: boolean;
    flexibility?: "fixed" | "flexible" | "optional";
  }) => void;
  onSubtaskToggle: (task: Task) => void;
  onAddSubtask: (parent: Task, title: string) => Promise<void>;
  pending: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [due, setDue] = useState(task.due ?? "");
  const [estimateMin, setEstimateMin] = useState(task.estimateMin);
  const [importance, setImportance] = useState(task.importance);
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [dependsOn, setDependsOn] = useState(task.dependsOn ?? "");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [status, setStatus] = useState<"plan" | "doing" | "done">(task.status as "plan" | "doing" | "done");
  const [isMit, setIsMit] = useState(task.isMit);
  const [flexibility, setFlexibility] = useState<"fixed" | "flexible" | "optional">(task.flexibility as "fixed" | "flexible" | "optional");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError("Название не может быть пустым");
    onSave({ id: task.id, title: title.trim(), notes: notes || null, due: due || null, estimateMin, importance, projectId: projectId || null, dependsOn: dependsOn || null, status, isMit, flexibility });
  };

  return (
    <Modal title="Настроить задачу" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <div className="field"><label htmlFor="edit-task-title">Название</label><input id="edit-task-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
        <div className="field"><label htmlFor="edit-task-notes">Описание</label><textarea id="edit-task-notes" className="textarea" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Детали, ссылки, критерий результата…" /></div>
        <div className="form-row">
          <div className="field"><label htmlFor="edit-task-due">Срок</label><DateField id="edit-task-due" className="input" value={due} onChange={(event) => setDue(event.target.value)} /></div>
          <div className="field"><label htmlFor="edit-task-estimate">Оценка, минут</label><input id="edit-task-estimate" className="input" type="number" min={15} step={15} value={estimateMin} onChange={(event) => setEstimateMin(Number(event.target.value))} /></div>
        </div>
        <div className="form-row">
          <div className="field"><label htmlFor="edit-task-project">Проект</label><AppSelect id="edit-task-project" className="select" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Без проекта</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {projectTypeLabel[project.type]}</option>)}</AppSelect></div>
          <div className="field"><label htmlFor="edit-task-status">Статус</label><AppSelect id="edit-task-status" className="select" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="plan">План</option><option value="doing">В работе</option><option value="done">Готово</option></AppSelect></div>
        </div>
        <div className="field"><label htmlFor="edit-task-dependency">Начать после</label><AppSelect id="edit-task-dependency" className="select" value={dependsOn} onChange={(event) => setDependsOn(event.target.value)}><option value="">Без зависимости</option>{data.tasks.filter(item => item.id !== task.id && !item.isDeleted).map(item => <option key={item.id} value={item.id}>{item.title}{item.status === "done" ? " · готово" : ""}</option>)}</AppSelect><small className="muted">Задачу нельзя завершить, пока эта не готова.</small></div>
        {!task.parentId && <section className="card task-subtasks"><div className="section-title"><h3>Подзадачи</h3><span className="badge">{data.tasks.filter(item => item.parentId === task.id && item.status === "done").length}/{data.tasks.filter(item => item.parentId === task.id).length}</span></div>{data.tasks.filter(item => item.parentId === task.id).map(child => <div className="list-row" key={child.id}><button type="button" className={`task-check ${child.status === "done" ? "checked" : ""}`} aria-label={child.status === "done" ? `Вернуть подзадачу «${child.title}»` : `Выполнить подзадачу «${child.title}»`} onClick={() => onSubtaskToggle(child)}>{child.status === "done" && <Check size={14} />}</button><span className="list-row-main">{child.title}</span></div>)}<div className="form-row"><input className="input" aria-label="Название подзадачи" placeholder="Добавить маленький шаг" value={subtaskTitle} onChange={event => setSubtaskTitle(event.target.value)} /><button className="button button-ghost" type="button" disabled={!subtaskTitle.trim() || addingSubtask} onClick={async () => { setAddingSubtask(true); try { await onAddSubtask(task, subtaskTitle.trim()); setSubtaskTitle(""); } catch (error) { setError((error as Error).message); } finally { setAddingSubtask(false); } }}>{addingSubtask ? "Добавляем…" : "Добавить"}</button></div><small className="muted">Задачу нельзя завершить, пока не готовы все шаги.</small></section>}
        <div className="form-row">
          <div className="field"><label htmlFor="edit-task-importance">Важность</label><AppSelect id="edit-task-importance" className="select" value={importance} onChange={(event) => setImportance(Number(event.target.value))}><option value={1}>1 — можно позже</option><option value={2}>2 — важно</option><option value={3}>3 — критично</option></AppSelect></div>
          <div className="field"><label htmlFor="edit-task-flexibility">Тип блока</label><AppSelect id="edit-task-flexibility" className="select" value={flexibility} onChange={(event) => setFlexibility(event.target.value as typeof flexibility)}><option value="flexible">Гибкое</option><option value="fixed">Фиксированное</option><option value="optional">По желанию</option></AppSelect></div>
        </div>
        <div className="switch-row"><span className="small"><strong>Главная задача дня</strong><br /><span className="muted">Показывать среди трёх MIT</span></span><button className={`switch ${isMit ? "on" : ""}`} type="button" role="switch" aria-checked={isMit} onClick={() => setIsMit(!isMit)} aria-label="Главная задача дня" /></div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить изменения"}</button>
      </form>
    </Modal>
  );
}
