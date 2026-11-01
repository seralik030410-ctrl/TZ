import { ScheduleTasks } from "@/components/ScheduleTasks";
import { TaskCompletion } from "@/components/TaskCompletion";
import { remainingMinutes, isStandaloneTask } from "@contracts/plannerState";
import { scheduleForDay } from "@contracts/schedule";
import { minutesInZone, daysLeftInMonth, normalizeCurrency } from "@contracts/shared";
import { useEffect, useRef, useState } from "react";
import { daySwipe } from "@contracts/daySwipe";
import { dayInZone } from "@contracts/shared";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { ModuleAttention } from "@/components/ModuleAttention";
import { DailyPlanner } from "@/components/DailyPlanner";
import { CloseDay } from "@/components/Routines";
import { useNavigate, useOutletContext } from "react-router";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Coffee,
  LockKeyhole,
  Plus,
  Timer,
  WalletCards,
} from "lucide-react";
import { getFreeWindows, safeToSpendToday } from "@contracts/planning";
import { addCalendarDays } from "@contracts/shared";
import {
  formatDuration,
  formatMoney,
  greeting,
  localDayKey,
  minutesToTime,
  projectColor,
  projectTypeLabel,
  type LayoutContext,
} from "@/lib/planner";

export default function Today() {
  const context = useOutletContext<LayoutContext>();
  const { openQuickAdd } = context;
  const data = { ...context.data, transactions: context.data.transactions.filter(t => t.currency === normalizeCurrency(context.data.settings?.currency)) };
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const actualToday = dayInZone(now, data.settings?.timezone ?? "Asia/Dushanbe");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const today = selectedDay ?? actualToday;
  const isToday = today === actualToday;
  const moveDay = (delta: number) => setSelectedDay(addCalendarDays(today, delta));
  const touch = useRef<{ x: number; y: number; at: number } | null>(null);
  const nowMinutes = isToday ? minutesInZone(now, data.settings?.timezone) : today < actualToday ? 1440 : 0;
  const utils = trpc.useUtils();
  const scheduleTask = trpc.planner.planning.scheduleTask.useMutation({
    onSuccess: async result => { await utils.planner.bootstrap.invalidate(); toast.success(result.remainingMin ? `Распределено ${formatDuration(result.minutes)}, ещё ${formatDuration(result.remainingMin)} не поместилось` : `В расписание добавлено ${formatDuration(result.minutes)}`); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);


  const schedule = scheduleForDay(data.schedule, data.scheduleExceptions ?? [], today)
    .map((item) => ({
      id: item.id,
      title: item.title,
      startMin: item.startMin,
      endMin: item.endMin,
      kind: item.kind,
      location: item.location,
      fixed: true,
      taskId: null,
      linkedTasks: data.tasks.filter(task => task.scheduleItemId === item.id && task.status !== "done" && (!task.due || task.due === today)),
    }));

  const taskBlocks = data.scheduledBlocks
    .filter((block) => localDayKey(block.start) === today)
    .map((block) => {
      const task = data.tasks.find((item) => item.id === block.taskId);
      if (!task || task.status === "done" || task.scheduleItemId || task.parentId) return null;
      return {
        id: block.id,
        title: task?.title ?? "Рабочий блок",
        startMin: minutesInZone(block.start, data.settings?.timezone),
        endMin: minutesInZone(block.end, data.settings?.timezone),
        kind: "project",
        location: "Запланированный блок",
        fixed: false,
        taskId: task.id,
        linkedTasks: [],
      };
    }).filter((block): block is NonNullable<typeof block> => block !== null);

  const agenda = [...schedule, ...taskBlocks].sort((a, b) => a.startMin - b.startMin);
  const freeWindows = getFreeWindows(
    data.settings?.workStartMin ?? 480,
    data.settings?.workEndMin ?? 1320,
    agenda,
  );
  const nextEvent = agenda.find((event) => event.endMin > nowMinutes) ?? null;
  const nextIn = nextEvent ? Math.max(0, nextEvent.startMin - nowMinutes) : 0;

  const timelineItems = (() => {
    const items: ({ type: "event"; event: typeof agenda[number] } | { type: "free"; startMin: number; endMin: number })[] = agenda.map((event) => ({ type: "event", event }));
    freeWindows.forEach((window) => items.push({ type: "free", ...window }));
    return items.sort((a, b) => {
      const aStart = a.type === "event" ? a.event.startMin : a.startMin;
      const bStart = b.type === "event" ? b.event.startMin : b.startMin;
      return aStart - bStart;
    });
  })();

  const todayTasks = data.tasks.filter((task) => task.status !== "done" && (task.due === today || (isToday && task.isMit && !task.due)));
  const dayTasks = data.tasks.filter(task => !task.scheduleItemId && !task.parentId && (task.due === today || (isToday && !task.due && (task.status !== "done" || (task.completedAt && localDayKey(task.completedAt) === today)))));
  const weekEnd = addCalendarDays(today, 7);
  const upcomingUnplanned = data.tasks.filter(task => isStandaloneTask(task) && !!task.due && task.due <= weekEnd && remainingMinutes(task, data.scheduledBlocks) > 0).sort((a,b) => (a.due ?? "").localeCompare(b.due ?? "") || b.importance-a.importance);
  const mitTasks = data.tasks.filter((task) => task.isMit && (task.due === today || (isToday && !task.due && task.status !== "done"))).slice(0, 3);
  const completedMit = mitTasks.filter((task) => task.status === "done").length;
  const overdue = data.tasks.filter((task) => task.status !== "done" && task.due && task.due < today);
  const todayTransactions = data.transactions.filter((transaction) => localDayKey(transaction.happenedAt) === today);
  const spentToday = todayTransactions.filter((transaction) => transaction.kind === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
  const monthPrefix = today.slice(0, 7);
  const spentMonth = data.transactions.filter((transaction) => transaction.kind === "expense" && localDayKey(transaction.happenedAt).startsWith(monthPrefix)).reduce((sum, transaction) => sum + transaction.amount, 0);
  const mandatoryPayments = data.recurringBills.filter(bill => bill.currency === normalizeCurrency(data.settings?.currency) && bill.paidThrough !== monthPrefix).reduce((sum, bill) => sum + bill.amount, 0);
  
  const safeMonthlySpend = safeToSpendToday({
    monthlyLimit: data.settings?.monthlyLimit ?? 0,
    spentThisMonth: spentMonth,
    mandatoryPayments,
    savingsContributions: data.settings?.monthlySavings ?? 0,
    cushion: data.settings?.cushion ?? 0,
    daysRemaining: daysLeftInMonth(today),
  });
  const dailyRoom = data.settings?.dailyLimit ? Math.max(0, data.settings.dailyLimit - spentToday) : Number.POSITIVE_INFINITY;
  const safeSpend = data.settings?.monthlyLimit || data.settings?.dailyLimit ? Math.min(data.settings?.monthlyLimit ? safeMonthlySpend : Number.POSITIVE_INFINITY, dailyRoom) : 0;

  const focusMinutes = data.timeLogs.filter((log) => localDayKey(log.start) === today).reduce((sum, log) => sum + log.minutes, 0);
  const goalMinutes = data.projects.reduce((sum, project) => sum + project.dailyMinutesGoal, 0);
  const focusPercent = Math.min(100, Math.round((focusMinutes / Math.max(1, goalMinutes)) * 100));
  const radius = 65;
  const circumference = 2 * Math.PI * radius;
  const freeMinutes = freeWindows.reduce((sum, window) => sum + window.endMin - window.startMin, 0);
  const activity = [
    ...data.timeLogs.slice(0, 3).map((log) => ({ id: log.id, title: data.projects.find((project) => project.id === log.projectId)?.name ?? "Фокус-сессия", text: `${formatDuration(log.minutes)} работы`, date: log.start, icon: Timer })),
    ...data.transactions.slice(0, 3).map((transaction) => ({ id: transaction.id, title: transaction.note || transaction.category, text: `${transaction.kind === "expense" ? "−" : "+"}${formatMoney(transaction.amount, data.settings?.currency)}`, date: transaction.happenedAt, icon: WalletCards })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 4);

  return (
    <div className="page" style={{ touchAction: "pan-y pinch-zoom" }} onTouchStart={event => {
      touch.current = null;
      if (event.touches.length !== 1 || (event.target as HTMLElement).closest("button,a,input,textarea,select,[role=button],[contenteditable=true],[role=dialog]")) return;
      touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, at: Date.now() };
    }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={event => {
      const start = touch.current; touch.current = null;
      if (!start || event.touches.length || !event.changedTouches[0]) return;
      const delta = daySwipe(event.changedTouches[0].clientX - start.x, event.changedTouches[0].clientY - start.y, Date.now() - start.at);
      if (delta) moveDay(delta);
    }}>
      <nav className="day-navigator" aria-label="Переключение дня">
        <button className="icon-button" aria-label="Предыдущий день" onClick={() => moveDay(-1)}><ChevronLeft size={22} /></button>
        <strong aria-live="polite">{new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`))}</strong>
        <button className="icon-button" aria-label="Следующий день" onClick={() => moveDay(1)}><ChevronRight size={22} /></button>
        {!isToday && <button className="button button-ghost button-small" onClick={() => setSelectedDay(null)}>Сегодня</button>}
      </nav>
      <div className="page-header">
        <div>
          <p className="eyebrow">{isToday ? "Сегодня" : "Просмотр выбранного дня"}</p>
          <h1>{greeting()}, {data.settings?.name ?? "Алекс"}!</h1>
          <p className="subtitle">На этот день: {schedule.filter((event) => event.kind === "class").length} пары, {freeWindows.length} окна и {overdue.length + todayTasks.filter((task) => task.due === today).length} дел, требующих внимания.</p>
        </div>
      </div>


        <section className="card today-timeline">
          <div className="section-title" style={{ marginTop: 0 }}>
            <div><p className="eyebrow">Ритм дня</p><h2>Лента и свободные окна</h2></div>
            <button className="text-button" type="button" onClick={() => navigate("/schedule")}>Расписание</button>
          </div>
          <div className="timeline">
            {timelineItems.length === 0 && <div className="empty-state"><CalendarDays size={28} /><strong>День пока пуст</strong><p>Добавьте постоянное расписание или запланируйте этап проекта.</p></div>}
            {timelineItems.map((item, index) => {
              const start = item.type === "event" ? item.event.startMin : item.startMin;
              const end = item.type === "event" ? item.event.endMin : item.endMin;
              const showNow = isToday && nowMinutes >= start && nowMinutes < end;
              return (
                <div key={item.type === "event" ? item.event.id : `free-${item.startMin}`}>
                  {showNow && <div className="now-line">СЕЙЧАС · {minutesToTime(nowMinutes)}</div>}
                  <div className="timeline-row">
                    <div className="timeline-time">{minutesToTime(start)}</div>
                    {item.type === "event" ? (
                      <div className={`timeline-event ${item.event.fixed ? "fixed" : ""}`}>
                        <button className="timeline-open text-button" type="button" onClick={() => navigate(item.event.fixed ? "/schedule" : "/tasks")}>Открыть {item.event.fixed ? "занятие" : "задачу"}</button>
                        <strong>{item.event.title}</strong>
                        {item.event.taskId && data.tasks.find(task => task.id === item.event.taskId) && <TaskCompletion task={data.tasks.find(task => task.id === item.event.taskId)!} />}
                        <span>{minutesToTime(end)} · {formatDuration(end - start)}{item.event.location ? ` · ${item.event.location}` : ""}</span>
                        {item.event.fixed && <ScheduleTasks data={data} eventId={item.event.id} day={today} />}
                        {item.event.fixed ? <LockKeyhole className="dot" size={13} style={{ background: "none" }} /> : <span className="dot" style={{ background: "var(--cat-personal)" }} />}
                      </div>
                    ) : (
                      <div className="free-window">
                        <span>Свободно {formatDuration(end - start)}</span>
                        <button className="text-button" type="button" onClick={() => openQuickAdd("task")}>Заполнить <ArrowRight size={13} /></button>
                      </div>
                    )}
                  </div>
                  {isToday && index === timelineItems.length - 1 && nowMinutes >= end && <div className="now-line">СЕЙЧАС · {minutesToTime(nowMinutes)}</div>}
                </div>
              );
            })}
          </div>
          {isToday && data.scheduledBlocks.length > 0 && (
            <DailyPlanner data={data} mode="reflow" />
          )}
        </section>


      {dayTasks.length > 0 && <section className="card" style={{ marginBottom: 18 }}>
        <div className="section-title" style={{ marginTop: 0 }}><h2>Задачи дня</h2><button className="text-button" onClick={() => navigate("/tasks")}>Все задачи →</button></div>
        <div className="plain-list">{dayTasks.map(task => <div key={task.id}>
          <div className="list-row"><TaskCompletion task={task} /><div className="list-row-main"><strong className={task.status === "done" ? "completed-step" : ""}>{task.title}</strong><span>{data.projects.find(p => p.id === task.projectId)?.name ?? "Личная задача"}{task.workspaceId ? " · Общая" : ""}</span></div></div>
          {data.tasks.filter(child => child.parentId === task.id).map(child => <div className="list-row" key={child.id} style={{ marginLeft: 30 }}><TaskCompletion task={child} /><span className={child.status === "done" ? "completed-step" : ""}>{child.title}</span></div>)}
        </div>)}</div>
      </section>}
      <div className="action-row" style={{ marginBottom: 18 }}>
        {isToday && <DailyPlanner data={data} />}
        {isToday && <CloseDay data={data} />}
        <button className="button button-primary" type="button" onClick={() => openQuickAdd("task")}><Plus size={18} />Новая задача</button>
        <button className="button button-ghost" type="button" onClick={() => navigate("/projects")}><Timer size={18} />{data.activeTimer ? "Открыть таймер" : "Старт таймера"}</button>
      </div>

      {upcomingUnplanned.length > 0 && <section className="card" style={{ marginBottom: 14 }}>
        <div className="section-title" style={{ marginTop: 0 }}><div><p className="eyebrow">Ближайшие 7 дней</p><h2>Задачи без времени в расписании</h2></div><span className="badge">{upcomingUnplanned.length}</span></div>
        <p className="small muted">Срок уже указан. Распределите оценённое время по свободным окнам до дедлайна.</p>
        <div className="plain-list">{upcomingUnplanned.slice(0, 6).map(task => <div className="list-row" key={task.id}><Clock3 size={17} color="var(--accent)"/><div className="list-row-main"><strong>{task.title}</strong><span>{data.projects.find(project => project.id === task.projectId)?.name ?? "Личная задача"} · срок {task.due} · {formatDuration(remainingMinutes(task, data.scheduledBlocks))} осталось</span></div><button className="button button-ghost button-small" type="button" disabled={scheduleTask.isPending} onClick={() => scheduleTask.mutate({ taskId: task.id, startDate: today, endDate: task.due! < today ? today : task.due! })}>Распределить</button></div>)}</div>
      </section>}

      <div className="dashboard-grid stagger">
        <section className="card dark-card span-7">
          <p className="eyebrow" style={{ color: "oklch(0.74 0.02 70)" }}>Следующее событие</p>
          {nextEvent ? (
            <>
              <div className="next-event-time number">{!isToday ? minutesToTime(nextEvent.startMin) : nextIn > 0 ? `через ${formatDuration(nextIn)}` : "сейчас"}</div>
              <p className="next-event-name">{nextEvent.title}</p>
              <p className="next-event-meta">{minutesToTime(nextEvent.startMin)}–{minutesToTime(nextEvent.endMin)}{nextEvent.location ? ` · ${nextEvent.location}` : ""}</p>
            </>
          ) : (
            <>
              <div className="next-event-time">День свободен</div>
              <p className="next-event-name">Фиксированных событий больше нет</p>
              <p className="next-event-meta">Можно спокойно закрыть главную задачу или закончить день.</p>
            </>
          )}
        </section>

        <section className="card span-5">
          <p className="card-label">Цель по проектам</p>
          <div className="progress-ring" aria-label={`Выполнено ${focusPercent}% дневной цели`}>
            <svg viewBox="0 0 156 156" aria-hidden="true">
              <circle className="ring-track" cx="78" cy="78" r={radius} />
              <circle className="ring-value" cx="78" cy="78" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - focusPercent / 100)} />
            </svg>
            <div className="ring-copy"><strong className="number">{focusPercent}%</strong><span>{formatDuration(focusMinutes)} из {formatDuration(goalMinutes)}</span></div>
          </div>
          <div className="legend-list">
            <div className="legend-row"><span className="dot" style={{ background: "var(--success)" }} />Задачи MIT<strong>{completedMit}/{mitTasks.length}</strong></div>
            <div className="legend-row"><span className="dot" style={{ background: "var(--info)" }} />События дня<strong>{agenda.length}</strong></div>
          </div>
        </section>

        <div className="metric-grid span-all">
          <section className="card metric-card">
            <CalendarDays className="icon" size={19} />
            <p className="card-label">Свободные окна</p>
            <p className="card-value number">{freeWindows.length}</p>
            <p className="metric-footer">{formatDuration(freeMinutes)} можно распределить</p>
          </section>
          <section className="card metric-card">
            <WalletCards className="icon" size={19} />
            <p className="card-label">Безопасно потратить</p>
            <p className="card-value number">{data.settings?.monthlyLimit || data.settings?.dailyLimit ? formatMoney(safeSpend, data.settings?.currency) : "Бюджет не задан"}</p>
            <p className="metric-footer">За выбранный день {formatMoney(spentToday, data.settings?.currency)}</p>
          </section>
          <section className="card metric-card">
            <CheckCircle2 className="icon" size={19} />
            <p className="card-label">Главные задачи</p>
            <p className="card-value number">{completedMit}/{mitTasks.length}</p>
            <p className="metric-footer">{mitTasks.find((task) => task.status !== "done")?.title ?? "Всё главное сделано"}</p>
          </section>
          <section className="card metric-card">
            <Timer className="icon" size={19} />
            <p className="card-label">Фокус за день</p>
            <p className="card-value number">{formatDuration(focusMinutes)}</p>
            <p className="metric-footer">{data.activeTimer ? "Таймер работает сейчас" : "Новая сессия — в проектах"}</p>
          </section>
        </div>

        <div className="today-side">
          <section className="card">
            <div className="section-title" style={{ marginTop: 0 }}><h2>Три главных дела</h2><button className="icon-button" type="button" onClick={() => openQuickAdd("task")} aria-label="Добавить главную задачу"><Plus size={18} /></button></div>
            {mitTasks.length === 0 && <p className="muted small">Добавьте задачу и отметьте её как главную.</p>}
            <div className="plain-list">
              {mitTasks.map((task) => (
                <div className="list-row" key={task.id}>
                  <TaskCompletion task={task} />
                  <div className="list-row-main"><strong>{task.title}</strong><span>{data.projects.find((project) => project.id === task.projectId)?.name ?? "Личная задача"}</span></div>
                </div>
              ))}
            </div>
            <button className="text-button" type="button" onClick={() => navigate("/tasks")}>Все задачи <ArrowRight size={13} /></button>
          </section>

          <section className="card" style={{ marginTop: 14 }}>
            <div className="section-title" style={{ marginTop: 0 }}><h2>Требует внимания</h2>{overdue.length > 0 && <span className="badge badge-danger">{overdue.length}</span>}</div>
            <ModuleAttention data={data} />
            {overdue.length === 0 && <p className="muted small"><CheckCircle2 size={16} /> Просроченных задач нет.</p>}
            {overdue.slice(0, 3).map((task) => (
              <div className="attention-item" key={task.id}><Clock3 size={17} color="var(--danger)" /><div className="list-row-main"><strong>{task.title}</strong><span>Срок был {task.due}</span></div></div>
            ))}
          </section>
        </div>

        <section className="card span-7">
          <div className="section-title" style={{ marginTop: 0 }}><h2>Прогресс проектов</h2><button className="text-button" type="button" onClick={() => navigate("/projects")}>Все проекты</button></div>
          <div className="plain-list">
            {data.projects.slice(0, 4).map((project) => {
              const minutes = data.timeLogs.filter((log) => log.projectId === project.id && localDayKey(log.start) === today).reduce((sum, log) => sum + log.minutes, 0);
              return (
                <div className="list-row" key={project.id}>
                  <span className="dot" style={{ background: projectColor[project.type] }} />
                  <div className="list-row-main"><strong>{project.name}</strong><span>{projectTypeLabel[project.type]} · {project.nextStep}</span></div>
                  <div className="list-row-value">{formatDuration(minutes)}<span className="muted" style={{ display: "block", fontSize: 10 }}>из {formatDuration(project.dailyMinutesGoal)}</span></div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card span-5">
          <div className="section-title" style={{ marginTop: 0 }}><h2>Последняя активность</h2><BookOpen size={18} color="var(--text-soft)" /></div>
          {activity.length === 0 && <p className="muted small">Здесь появятся ваши действия за день.</p>}
          <div className="activity-list">
            {activity.map((item) => (
              <div className="activity-item" key={item.id}><item.icon size={17} color="var(--accent)" /><div className="list-row-main"><strong>{item.title}</strong><span>{item.text}</span></div></div>
            ))}
          </div>
        </section>

        <section className="card accent-card span-all" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Coffee size={25} color="var(--accent)" />
          <div style={{ flex: 1, minWidth: 220 }}><strong>Маленький шаг тоже считается.</strong><p className="small muted" style={{ margin: "3px 0 0" }}>Выберите одну главную задачу на ближайшее окно — остальное подождёт.</p></div>
          <button className="button button-dark button-small" type="button" onClick={() => navigate("/journal")}>Итоги дня <ArrowRight size={15} /></button>
        </section>
      </div>
    </div>
  );
}
