import { normalizeCurrency } from "@contracts/shared";
import { useState, type CSSProperties } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { ArrowRight, CalendarRange, CheckCircle2, Gauge, Timer, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { formatDuration, formatMoney, localDayKey, projectColor, projectTypeLabel, type LayoutContext } from "@/lib/planner";

export default function Week() {
  const context = useOutletContext<LayoutContext>();
  const data = { ...context.data, transactions: context.data.transactions.filter(t => t.currency === normalizeCurrency(context.data.settings?.currency)) };
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [planning, setPlanning] = useState(false);
  const autoPlan = trpc.planner.planning.autoPlan.useMutation();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const key = localDayKey(date);
    return { key, date, label: new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", "") };
  });
  const weekStart = days[0].key;
  const logs = data.timeLogs.filter((log) => localDayKey(log.start) >= weekStart);
  const transactions = data.transactions.filter((transaction) => localDayKey(transaction.happenedAt) >= weekStart);
  const completed = data.tasks.filter((task) => task.status === "done").length;
  const expenses = transactions.filter((transaction) => transaction.kind === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
  const income = transactions.filter((transaction) => transaction.kind === "income").reduce((sum, transaction) => sum + transaction.amount, 0);
  const journal = data.journal.filter((entry) => entry.date >= weekStart);
  const averageEnergy = journal.length ? (journal.reduce((sum, entry) => sum + entry.energy, 0) / journal.length).toFixed(1) : "—";
  const totalMinutes = logs.reduce((sum, log) => sum + log.minutes, 0);
  const maxDayMinutes = Math.max(60, ...days.map((day) => logs.filter((log) => localDayKey(log.start) === day.key).reduce((sum, log) => sum + log.minutes, 0)));

  const planNextWeek = async () => {
    const monday = new Date();
    const offset = ((8 - (monday.getDay() || 7)) % 7) || 7;
    monday.setDate(monday.getDate() + offset);
    const stages = data.stages.filter((stage) => stage.status === "active" && data.tasks.some((task) => task.stageId === stage.id && task.status !== "done"));
    if (!stages.length) {
      toast.info("Нет активных этапов с открытыми задачами");
      navigate("/projects");
      return;
    }
    if (!window.confirm(`Разложить открытые этапы по дням с ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(monday)}?`)) return;
    setPlanning(true);
    try {
      let count = 0;
      for (const stage of stages) {
        const result = await autoPlan.mutateAsync({ stageId: stage.id, startDate: localDayKey(monday), days: 7 });
        count += result.count;
      }
      await utils.planner.bootstrap.invalidate();
      toast.success(`План недели готов: ${count} рабочих блоков`);
      navigate("/projects");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось построить план");
    } finally {
      setPlanning(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Семь дней без самообмана</p><h1>Неделя</h1><p className="subtitle">Сопоставьте цели и факт: куда ушло время, что завершено и как менялась энергия.</p></div><button className="button button-primary quick-add-desktop" type="button" onClick={planNextWeek} disabled={planning}><CalendarRange size={17} />{planning ? "Строим план…" : "План на следующую неделю"}</button></div>

      <div className="stat-strip stagger">
        <section className="card"><Timer size={20} color="var(--accent)" /><p className="card-value">{formatDuration(totalMinutes)}</p><p className="card-label">часов фокуса</p></section>
        <section className="card"><CheckCircle2 size={20} color="var(--success)" /><p className="card-value">{completed}</p><p className="card-label">выполненных задач всего</p></section>
        <section className="card"><WalletCards size={20} color="var(--warning)" /><p className="card-value">{formatMoney(expenses, data.settings?.currency)}</p><p className="card-label">расходы за 7 дней</p></section>
        <section className="card"><Gauge size={20} color="var(--info)" /><p className="card-value">{averageEnergy}</p><p className="card-label">средняя энергия</p></section>
      </div>

      <div className="dashboard-grid" style={{ marginTop: 14 }}>
        <section className="card span-7">
          <div className="section-title" style={{ marginTop: 0 }}><div><p className="eyebrow">День ко дню</p><h2>Ритм фокуса</h2></div><span className="badge badge-info">7 дней</span></div>
          <div className="bar-chart">
            {days.map((day) => {
              const minutes = logs.filter((log) => localDayKey(log.start) === day.key).reduce((sum, log) => sum + log.minutes, 0);
              return <div className="bar-column" key={day.key}><span className="bar-value">{minutes ? formatDuration(minutes) : "—"}</span><div className="bar" style={{ height: `${Math.max(3, minutes / maxDayMinutes * 100)}%` }} /><span className="bar-label">{day.label}</span></div>;
            })}
          </div>
        </section>
        <section className="card span-5">
          <div className="section-title" style={{ marginTop: 0 }}><h2>Баланс недели</h2></div>
          <div className="plain-list">
            <div className="list-row"><div className="list-row-main"><strong>Доходы</strong><span>За последние семь дней</span></div><span className="transaction-amount income list-row-value">+{formatMoney(income, data.settings?.currency)}</span></div>
            <div className="list-row"><div className="list-row-main"><strong>Расходы</strong><span>Без скрытых корректировок</span></div><span className="transaction-amount expense list-row-value">−{formatMoney(expenses, data.settings?.currency)}</span></div>
            <div className="list-row"><div className="list-row-main"><strong>Записей в дневнике</strong><span>{journal.length} из 7 дней</span></div><span className="list-row-value">{Math.round(journal.length / 7 * 100)}%</span></div>
          </div>
        </section>

        <section className="card span-all">
          <div className="section-title" style={{ marginTop: 0 }}><div><p className="eyebrow">Цель против факта</p><h2>Проекты за неделю</h2></div><button className="text-button" type="button" onClick={() => navigate("/projects")}>Открыть проекты <ArrowRight size={14} /></button></div>
          <div className="project-grid">
            {data.projects.map((project) => {
              const minutes = logs.filter((log) => log.projectId === project.id).reduce((sum, log) => sum + log.minutes, 0);
              const percent = Math.min(100, Math.round(minutes / Math.max(1, project.weeklyMinutesGoal) * 100));
              return (
                <article key={project.id} style={{ "--project-color": projectColor[project.type] } as CSSProperties}>
                  <div className="project-top"><span className="dot" style={{ background: projectColor[project.type], marginTop: 7 }} /><div className="project-title"><h3>{project.name}</h3><p>{projectTypeLabel[project.type]}</p></div><strong>{percent}%</strong></div>
                  <div className="progress-track"><div className="progress-fill" style={{ transform: `scaleX(${percent / 100})` }} /></div>
                  <div className="project-stats"><span>{formatDuration(minutes)} факт</span><span>{formatDuration(project.weeklyMinutesGoal)} цель</span></div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <button className="button button-primary button-wide" style={{ marginTop: 18 }} type="button" onClick={planNextWeek} disabled={planning}><CalendarRange size={18} />{planning ? "Раскладываем этапы…" : "Составить план на следующую неделю"}</button>
    </div>
  );
}
