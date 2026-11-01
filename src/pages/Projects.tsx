import { isStandaloneTask, remainingMinutes } from "@contracts/plannerState";
import { SharedAccess } from "@/components/SharedAccess";
import { QuickAdd } from "@/components/QuickAdd";
import { TaskEditor } from "./Tasks";
import { RecordForm } from "@/components/ModuleKit";
import { moduleMutation, options } from "@/lib/moduleData";
import { projectUpdateSchema } from "@contracts/projects";
import { MonthNavigator } from "@/components/MonthNavigator";
import { AppSelect, DateField } from "@/components/FormControls";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useOutletContext } from "react-router";
import {
  CalendarRange,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Play,
  Plus,
  Square,
  Timer,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { trpc } from "@/providers/trpc";
import {
  daysUntil,
  formatDuration,
  formatMoney,
  localDayKey,
  projectColor,
  projectTypeLabel,
  type LayoutContext,
  type Project,
  type Task,
} from "@/lib/planner";

export default function Projects() {
  const { data } = useOutletContext<LayoutContext>();
  const utils = trpc.useUtils();
  const [viewMonth, setViewMonth] = useState<string | null>(null);
  const [newProject, setNewProject] = useState(false);
  const [paymentProject, setPaymentProject] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState<{ projectId: string; stageId?: string } | null>(null);
  const [timerProject, setTimerProject] = useState<Project | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const [stageFor, setStageFor] = useState<string | null>(null);
  const [stageName, setStageName] = useState("");
  const today = localDayKey();

  const refresh = async () => { await utils.planner.bootstrap.invalidate(); };
  const updateProject = trpc.planner.projects.update.useMutation();
  const updateTask = trpc.planner.tasks.update.useMutation({ onSuccess: async () => { await refresh(); setEditingTask(null); }, onError: e => toast.error(e.message) });
  const toggleTask = (task: Task) => updateTask.mutate({ id: task.id, status: task.status === "done" ? "plan" : "done" });
  const startTimer = trpc.planner.timer.start.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Фокус-сессия началась"); },
    onError: (error) => toast.error(error.message),
  });
  const stopTimer = trpc.planner.timer.stop.useMutation({
    onSuccess: async (result) => { await refresh(); toast.success(`Сессия записана: ${formatDuration(result.minutes)}`); setTimerOpen(false); },
    onError: (error) => toast.error(error.message),
  });
  const autoPlan = trpc.planner.planning.autoPlan.useMutation({
    onSuccess: async (result) => { await refresh(); toast.success(`Готово: расставлено блоков — ${result.count}`); },
    onError: (error) => toast.error(error.message),
  });
  const createStage = trpc.planner.stages.create.useMutation({ onSuccess: async () => { await refresh(); toast.success("Этап добавлен"); }, onError: error => toast.error(error.message) });

  const openTimer = (project?: Project) => {
    const activeProject = data.activeTimer ? data.projects.find((item) => item.id === data.activeTimer?.projectId) : undefined;
    setTimerProject(activeProject ?? project ?? data.projects[0] ?? null);
    setTimerOpen(true);
  };

  const planStage = (project: Project, stageId?: string) => {
    const stage = data.stages.find((item) => item.projectId === project.id && item.status === "active" && (stageId ? item.id === stageId : data.tasks.some(t => (t.stageId === item.id || (!t.stageId && t.projectId === project.id)) && isStandaloneTask(t) && remainingMinutes(t, data.scheduledBlocks) > 0)));
    if (!stage) return toast.info("Сначала добавьте активный этап проекту");
    const openStageTasks = data.tasks.filter((task) => (task.stageId === stage.id || (!task.stageId && task.projectId === project.id)) && task.status !== "done");
    const count = openStageTasks.filter(task => isStandaloneTask(task) && remainingMinutes(task, data.scheduledBlocks) > 0).length;
    if (!count) return toast.info(openStageTasks.length ? "Все открытые задачи этапа уже стоят в расписании" : "В этом этапе нет открытых задач");
    if (window.confirm(`Разложить ${count} задач этапа «${stage.name}» по свободным окнам на 7 дней?`)) {
      autoPlan.mutate({ stageId: stage.id, startDate: today, days: 7 });
    }
  };

  const totalWeekGoal = data.projects.reduce((sum, project) => sum + project.weeklyMinutesGoal, 0);
  const totalWeekMinutes = data.timeLogs.filter((log) => Date.now() - log.start.getTime() < 7 * 86_400_000).reduce((sum, log) => sum + log.minutes, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div><p className="eyebrow">Не список желаний, а рабочие этапы</p><h1>Проекты</h1><p className="subtitle">Видно, куда уходит время, что движется и сколько часов нужно до дедлайна.</p></div>
        <div className="action-row quick-add-desktop">
          <button className="button button-ghost" type="button" onClick={() => openTimer()}><Timer size={18} />{data.activeTimer ? "Таймер идёт" : "Фокус"}</button>
          <button className="button button-primary" type="button" onClick={() => setNewProject(true)}><Plus size={18} />Новый проект</button>
        </div>
      </div>

      <section className="card dark-card" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 230 }}><p className="eyebrow" style={{ color: "oklch(0.74 0.02 70)" }}>Недельный фокус</p><p className="card-value number">{formatDuration(totalWeekMinutes)} <span style={{ fontSize: 16, fontWeight: 500 }}>из {formatDuration(totalWeekGoal)}</span></p><p className="small muted">Записывайте реальные сессии — план будет становиться точнее.</p></div>
        <button className="button button-primary" type="button" onClick={() => openTimer()}>{data.activeTimer ? <Square size={17} /> : <Play size={17} />}{data.activeTimer ? "Завершить сессию" : "Начать фокус"}</button>
      </section>

      <MonthNavigator value={viewMonth} onChange={setViewMonth} />
      <div className="project-grid stagger">
        {data.projects.filter(project => !viewMonth || project.deadline?.startsWith(viewMonth) || data.tasks.some(task => task.projectId === project.id && task.due?.startsWith(viewMonth))).map((project) => {
          const projectTasks = data.tasks.filter((task) => task.projectId === project.id);
          const openTasks = projectTasks.filter((task) => task.status !== "done");
          const todayMinutes = data.timeLogs.filter((log) => log.projectId === project.id && localDayKey(log.start) === today).reduce((sum, log) => sum + log.minutes, 0);
          const dailyPercent = Math.min(100, Math.round(todayMinutes / Math.max(1, project.dailyMinutesGoal) * 100));
          const daysLeft = daysUntil(project.deadline);
          const remainingEstimate = openTasks.reduce((sum, task) => sum + task.estimateMin, 0);
          const neededPerDay = Number.isFinite(daysLeft) && daysLeft > 0 ? Math.ceil(remainingEstimate / daysLeft) : remainingEstimate;
          const chart = Array.from({ length: 14 }, (_, index) => {
            const date = new Date(); date.setDate(date.getDate() - (13 - index));
            const key = localDayKey(date);
            return data.timeLogs.filter((log) => log.projectId === project.id && localDayKey(log.start) === key).reduce((sum, log) => sum + log.minutes, 0);
          });
          const chartMax = Math.max(60, ...chart);
          const linkedMoney = data.transactions.filter(row => row.projectId === project.id).reduce((result, row) => {
            const total = result[row.currency] ??= { income: 0, expense: 0 };
            total[row.kind === "income" ? "income" : "expense"] += row.amount;
            return result;
          }, {} as Record<string, { income: number; expense: number }>);
          const stages = data.stages.filter(stage => stage.projectId === project.id).sort((a,b) => a.position-b.position);
          return (
            <article className="card project-card card-interactive" key={project.id} style={{ "--project-color": projectColor[project.type] } as CSSProperties}>
              <div className="project-top">
                <div className="project-symbol"><FolderKanban size={22} /></div>
                <div className="project-title"><h3>{project.name} {project.workspaceId && <span className="badge">Общее</span>}</h3><p>{projectTypeLabel[project.type]} · {openTasks.length} открытых задач</p></div>
                <span className={`badge ${project.status === "active" || project.status === "done" ? "badge-success" : "badge-warning"}`}>{project.status === "active" ? "В работе" : project.status === "done" ? "Завершён" : "Пауза"}</span>
              </div>
              <div className="progress-track" aria-label={`${dailyPercent}% дневной цели`}><div className="progress-fill" style={{ transform: `scaleX(${dailyPercent / 100})` }} /></div>
              <div className="project-stats"><span>{formatDuration(todayMinutes)} из {formatDuration(project.dailyMinutesGoal)} сегодня</span><strong>{dailyPercent}%</strong></div>
              <div className="sparkline" aria-label="Часы за последние 14 дней">
                {chart.map((minutes, index) => <span key={index} style={{ height: `${Math.max(5, minutes / chartMax * 100)}%`, opacity: minutes ? 0.8 : 0.16 }} title={`${minutes} минут`} />)}
              </div>
              <div className="action-row" style={{ margin: "12px 0" }}><button className="button button-ghost button-small" onClick={() => setEditingProject(project)}>Редактировать проект</button><button className="button button-primary button-small" onClick={() => setNewTask({ projectId: project.id })}><Plus size={15} />Новая задача</button></div>
              <div className="project-next"><span>Ближайший шаг</span>{project.nextStep || "Определите следующее конкретное действие"}</div>
              <div className="project-stats" style={{ marginBottom: 14 }}>
                <span><CalendarRange size={13} style={{ display: "inline", marginRight: 4 }} />{project.deadline ? `${daysLeft} дн. до дедлайна` : "Без дедлайна"}</span>
                {remainingEstimate > 0 && <strong>{formatDuration(neededPerDay)}/день</strong>}
              </div>
              <div className="project-profit"><strong><TrendingUp size={14} />Финансы проекта</strong>{Object.entries(linkedMoney).length ? Object.entries(linkedMoney).map(([code, money]) => <span key={code}>Прибыль {formatMoney(money.income-money.expense, code)} <small>· доход {formatMoney(money.income, code)} / расходы {formatMoney(money.expense, code)}</small></span>) : <span>Пока нет операций · план {formatMoney(project.expectedIncome, data.settings?.currency)}</span>}</div>
              <div className="project-profit"><strong>Ожидается после сдачи</strong>{(data.pendingTransactions ?? []).filter(t => t.projectId === project.id).map(t => <span key={t.id}>{formatMoney(t.amount, t.currency)}{t.expectedOn ? ` · ${t.expectedOn}` : ""}</span>)}<button className="text-button" onClick={() => setPaymentProject(project)}>+ Ожидаемая оплата</button></div>
              <section className="project-stage-tree"><div className="section-title"><strong>Этапы и задачи</strong><button className="text-button" type="button" onClick={() => { setStageFor(stageFor === project.id ? null : project.id); setStageName(""); }}>+ этап</button></div>
                {stageFor === project.id && <form className="action-row stage-add-form" onSubmit={event => { event.preventDefault(); if (!stageName.trim()) return; createStage.mutate({ projectId: project.id, name: stageName.trim() }, { onSuccess: () => { setStageFor(null); setStageName(""); } }); }}><input autoFocus className="input" aria-label="Название нового этапа" placeholder="Например: Подготовка материалов" value={stageName} onChange={event => setStageName(event.target.value)} maxLength={160}/><button className="button button-ghost button-small" disabled={!stageName.trim() || createStage.isPending} type="submit">Добавить</button></form>}
                {([...stages, ...(projectTasks.some(t => !t.stageId) ? [{ id: "__unassigned", name: "Без этапа", position: 0 }] : [])]).map(stage => {
                  const stageTasks = projectTasks.filter(task => stage.id === "__unassigned" ? !task.stageId : task.stageId === stage.id);
                  return <div className="project-stage" key={stage.id}><div className="section-title"><strong>{stage.name}</strong><div className="project-stage-actions"><button className="text-button" onClick={() => setNewTask({ projectId: project.id, stageId: stage.id === "__unassigned" ? "" : stage.id })}>+ задача</button>{stage.id !== "__unassigned" && <button className="text-button" disabled={autoPlan.isPending} onClick={() => planStage(project, stage.id)}>Распределить</button>}</div></div>{stageTasks.filter(task => !task.parentId).map(task => <div className="project-tree-task" key={task.id}><span className={`task-tree-mark ${task.status === "done" ? "done" : ""}`} /> <span><button type="button" className="project-task-edit text-button" onClick={() => setEditingTask(task)}>{task.title}</button>{task.dependsOn && <small className="project-dependency">После: {data.tasks.find(item => item.id === task.dependsOn)?.title ?? "связанной задачи"}</small>}</span>{projectTasks.filter(child => child.parentId === task.id).length > 0 && <div className="project-tree-children">{projectTasks.filter(child => child.parentId === task.id).map(child => <div key={child.id}><span className={`task-tree-mark ${child.status === "done" ? "done" : ""}`} /><button type="button" className="project-task-edit text-button" onClick={() => setEditingTask(child)}>{child.title}</button></div>)}</div>}</div>)}{stageTasks.length === 0 && <small className="muted">Здесь появятся задачи</small>}</div>;
                })}
              </section>
              <div className="action-row" style={{ marginTop: 16 }}>
                <button className="button button-dark button-small" type="button" onClick={() => openTimer(project)}><Play size={15} />Фокус</button>
                <button className="button button-ghost button-small" type="button" onClick={() => planStage(project)} disabled={autoPlan.isPending}><CalendarRange size={15} />Разложить этап</button>
              </div>
            </article>
          );
        })}
      </div>

      {data.projects.length === 0 && <section className="card empty-state"><FolderKanban size={32} /><strong>Создайте первый проект</strong><p>Разбейте результат на этапы и задайте реалистичную цель часов.</p><button className="button button-primary" type="button" onClick={() => setNewProject(true)}>Новый проект</button></section>}

      <section className="card" style={{ marginTop: 20 }}>
        <div className="section-title" style={{ marginTop: 0 }}><h2>Последние рабочие сессии</h2><Clock3 size={19} color="var(--text-soft)" /></div>
        <div className="plain-list">
          {data.timeLogs.slice(0, 6).map((log) => (
            <div className="list-row" key={log.id}><CheckCircle2 size={18} color="var(--success)" /><div className="list-row-main"><strong>{data.projects.find((project) => project.id === log.projectId)?.name ?? "Проект"}</strong><span>{log.note || new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(log.start)}</span></div><div className="list-row-value">{formatDuration(log.minutes)}</div></div>
          ))}
        </div>
      </section>

      {newProject && <NewProjectModal data={data} onClose={() => setNewProject(false)} />}
      {paymentProject && <QuickAdd key={paymentProject.id} kind="income" initialProjectId={paymentProject.id} data={data} onClose={() => setPaymentProject(null)} />}
      {newTask && <QuickAdd key={`${newTask.projectId}:${newTask.stageId ?? ""}`} kind="task" initialProjectId={newTask.projectId} initialStageId={newTask.stageId} data={data} onClose={() => setNewTask(null)} />}
      {editingTask && <TaskEditor key={editingTask.id} task={editingTask} data={data} onClose={() => setEditingTask(null)} onSave={input => updateTask.mutate(input)} onSubtaskToggle={toggleTask} onAddSubtask={async (parent, title) => { await moduleMutation("planner.tasks.create", { id: crypto.randomUUID(), title, parentId: parent.id, projectId: parent.projectId, stageId: parent.stageId, workspaceId: parent.workspaceId, due: parent.due }); await refresh(); }} pending={updateTask.isPending} />}
      {editingProject && <RecordForm title="Редактировать проект" initial={editingProject} fields={[
        { key: "name", label: "Название", required: true },
        { key: "type", label: "Тип проекта", options: options(projectTypeLabel), required: true },
        { key: "status", label: "Статус", options: options({ active: "В работе", paused: "Пауза", done: "Завершён" }), required: true },
        { key: "deadline", label: "Срок сдачи", type: "date" },
        { key: "expectedIncome", label: `Плановая сумма, ${data.settings?.currency ?? "TJS"}`, type: "money", hint: "Это ориентир проекта. Реальную ожидаемую оплату добавляйте через «Ожидаемая оплата»." },
        { key: "nextStep", label: "Ближайший шаг", type: "textarea" },
        { key: "dailyMinutesGoal", label: "Минут в день", type: "number" },
        { key: "weeklyMinutesGoal", label: "Минут в неделю", type: "number" },
      ]} schema={projectUpdateSchema} onClose={() => setEditingProject(null)} onSave={async value => { await updateProject.mutateAsync(projectUpdateSchema.parse(value)); await refresh(); }} />}
      {timerOpen && timerProject && <TimerModal project={timerProject} data={data} onProjectChange={setTimerProject} onClose={() => setTimerOpen(false)} onStart={(input) => startTimer.mutate(input)} onStop={() => stopTimer.mutate()} pending={startTimer.isPending || stopTimer.isPending} />}
    </div>
  );
}

function NewProjectModal({ onClose, data }: { onClose: () => void; data: LayoutContext["data"] }) {
  const utils = trpc.useUtils();
  const [workspaceId, setWorkspaceId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"money" | "study" | "personal" | "agency">("personal");
  const [deadline, setDeadline] = useState("");
  const [dailyMinutesGoal, setDailyMinutesGoal] = useState(60);
  const [weeklyMinutesGoal, setWeeklyMinutesGoal] = useState(300);
  const [expectedIncome, setExpectedIncome] = useState(0);
  const [error, setError] = useState("");
  const create = trpc.planner.projects.create.useMutation({
    onSuccess: async () => { await utils.planner.bootstrap.invalidate(); toast.success("Проект и первый этап созданы"); onClose(); },
    onError: (mutationError) => setError(mutationError.message),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Дайте проекту понятное название");
    create.mutate({ id: crypto.randomUUID(), name: name.trim(), workspaceId: workspaceId || null, type, deadline: deadline || undefined, dailyMinutesGoal, weeklyMinutesGoal, expectedIncome: Math.round(expectedIncome * 100) });
  };
  return (
    <Modal title="Новый проект" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <SharedAccess id="new-project-access" data={data} value={workspaceId} onChange={setWorkspaceId} />
        <div className="field"><label htmlFor="new-project-name">Название результата</label><input id="new-project-name" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, запустить первую версию" /></div>
        <div className="form-row">
          <div className="field"><label htmlFor="new-project-type">Тип</label><AppSelect id="new-project-type" className="select" value={type} onChange={(event) => setType(event.target.value as typeof type)}>{Object.entries(projectTypeLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</AppSelect></div>
          <div className="field"><label htmlFor="new-project-deadline">Дедлайн</label><DateField id="new-project-deadline" className="input" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="field"><label htmlFor="new-project-daily">Цель в день, минут</label><input id="new-project-daily" className="input" type="number" min={0} step={15} value={dailyMinutesGoal} onChange={(event) => setDailyMinutesGoal(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="new-project-weekly">Цель в неделю, минут</label><input id="new-project-weekly" className="input" type="number" min={0} step={30} value={weeklyMinutesGoal} onChange={(event) => setWeeklyMinutesGoal(Number(event.target.value))} /></div>
        </div>
        {(type === "money" || type === "agency") && <div className="field"><label htmlFor="new-project-income">Плановая прибыль, {data.settings?.currency ?? "TJS"}</label><input id="new-project-income" className="input" type="number" min={0} step={1000} value={expectedIncome} onChange={(event) => setExpectedIncome(Number(event.target.value))} /></div>}
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" type="submit" disabled={create.isPending}>{create.isPending ? "Создаём…" : "Создать проект и этап"}</button>
      </form>
    </Modal>
  );
}

function TimerModal({ project, data, onProjectChange, onClose, onStart, onStop, pending }: {
  project: Project;
  data: LayoutContext["data"];
  onProjectChange: (project: Project) => void;
  onClose: () => void;
  onStart: (input: { projectId: string; taskId?: string | null; note?: string }) => void;
  onStop: () => void;
  pending: boolean;
}) {
  const [taskId, setTaskId] = useState("");
  const [preset, setPreset] = useState(25);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(0);
  const active = data.activeTimer;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsedSeconds = active ? Math.max(0, Math.floor((now - active.start.getTime()) / 1000)) : preset * 60;
  const display = `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, "0")}:${String(Math.floor(elapsedSeconds / 60) % 60).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const tasks = useMemo(() => data.tasks.filter((task) => task.projectId === project.id && task.status !== "done"), [data.tasks, project.id]);

  return (
    <Modal title={active ? "Фокус-сессия идёт" : "Настроить фокус"} onClose={onClose}>
      <div className="field"><label htmlFor="timer-project">Проект</label><AppSelect id="timer-project" className="select" value={active?.projectId ?? project.id} disabled={!!active} onChange={(event) => { const selected = data.projects.find((item) => item.id === event.target.value); if (selected) onProjectChange(selected); }}>{data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</AppSelect></div>
      <div className="timer-display number">{display}</div>
      {!active && (
        <>
          <div className="timer-presets">{[15, 25, 50, 90].map((minutes) => <button key={minutes} className={preset === minutes ? "active" : ""} type="button" onClick={() => setPreset(minutes)}>{minutes} мин</button>)}</div>
          <div className="form-grid">
            <div className="field"><label htmlFor="timer-task">Задача</label><AppSelect id="timer-task" className="select" value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">Только проект</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</AppSelect></div>
            <div className="field"><label htmlFor="timer-note">Намерение на сессию</label><input id="timer-note" className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Что должно быть готово?" /></div>
          </div>
        </>
      )}
      {active && <p className="subtitle" style={{ textAlign: "center", margin: "0 0 20px" }}>{active.note || "Телефон можно отложить. Время записывается автоматически."}</p>}
      <button className={`button button-wide ${active ? "button-danger" : "button-primary"}`} style={{ marginTop: 18 }} type="button" disabled={pending} onClick={() => active ? onStop() : onStart({ projectId: project.id, taskId: taskId || null, note: note || undefined })}>
        {active ? <Square size={18} /> : <Play size={18} />}{pending ? "Сохраняем…" : active ? "Завершить и записать время" : `Начать ${preset} минут фокуса`}
      </button>
    </Modal>
  );
}
