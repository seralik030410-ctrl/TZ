import { AppSelect } from "@/components/FormControls";
import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";
import { Download, LogOut, Moon, Save, ShieldCheck, Sun } from "lucide-react";
import { toast } from "sonner";
import { currencies } from "@/components/ModuleKit";
import { trpc } from "@/providers/trpc";
import { downloadJson, localDayKey, minutesToTime, timeToMinutes, type LayoutContext } from "@/lib/planner";

export default function Settings() {
  const { data, refresh } = useOutletContext<LayoutContext>();
  const utils = trpc.useUtils();
  const [name, setName] = useState(data.settings?.name ?? "Алекс");
  const [currency, setCurrency] = useState(({ "₽": "RUB", "$": "USD" }[data.settings?.currency ?? ""] ?? data.settings?.currency ?? "TJS"));
  const [dailyLimit, setDailyLimit] = useState((data.settings?.dailyLimit ?? 0) / 100);
  const [monthlyLimit, setMonthlyLimit] = useState((data.settings?.monthlyLimit ?? 0) / 100);
  const [cushion, setCushion] = useState((data.settings?.cushion ?? 0) / 100);
  const [workStart, setWorkStart] = useState(minutesToTime(data.settings?.workStartMin ?? 480));
  const [workEnd, setWorkEnd] = useState(minutesToTime(data.settings?.workEndMin ?? 1320));
  const [online, setOnline] = useState(navigator.onLine);
  const [timezone, setTimezone] = useState(data.settings?.timezone ?? "Asia/Dushanbe");
  const [agencyGoal, setAgencyGoal] = useState((data.settings?.agencyGoal ?? 10000000) / 100);
  const [goalCurrency, setGoalCurrency] = useState(data.settings?.agencyGoalCurrency ?? "TJS");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  const update = trpc.planner.settings.update.useMutation({
    onSuccess: async () => { await utils.planner.bootstrap.invalidate(); toast.success("Настройки сохранены"); },
    onError: (error) => toast.error(error.message),
  });
  const logout = trpc.planner.auth.logout.useMutation({ onSuccess: () => { localStorage.removeItem("planner-last-data"); window.location.reload(); } });
  const exportQuery = trpc.planner.exportData.useQuery(undefined, { enabled: false });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return toast.error("Имя не может быть пустым");
    if (timeToMinutes(workEnd) <= timeToMinutes(workStart)) return toast.error("Конец рабочего дня должен быть позже начала");
    update.mutate({ name: name.trim(), currency, dailyLimit: Math.round(dailyLimit * 100), monthlyLimit: Math.round(monthlyLimit * 100), cushion: Math.round(cushion * 100), workStartMin: timeToMinutes(workStart), workEndMin: timeToMinutes(workEnd), timezone, agencyGoal: Math.round(agencyGoal * 100), agencyGoalCurrency: goalCurrency as "TJS" | "USD" | "RUB" | "EUR" | "KZT" });
  };

  const changeTheme = (theme: "light" | "dark") => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    update.mutate({ theme });
  };
  const exportJson = async () => {
    const result = await exportQuery.refetch();
    if (result.data) { downloadJson(result.data, `ритм-экспорт-${localDayKey()}.json`); toast.success("JSON-экспорт готов"); }
    else toast.error("Не удалось получить данные");
  };
  const exportCsv = () => {
    const rows = [["type", "id", "title_or_category", "amount_or_minutes", "date"], ...data.tasks.map((task) => ["task", task.id, task.title, String(task.estimateMin), task.due ?? ""]), ...data.transactions.map((transaction) => [transaction.kind, transaction.id, transaction.category, String(transaction.amount), localDayKey(transaction.happenedAt)])];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ритм-экспорт-${localDayKey()}.csv`; anchor.click(); URL.revokeObjectURL(url);
    toast.success("CSV-экспорт готов");
  };

  return (
    <div className="page">
      <div className="page-header"><div><p className="eyebrow">Приложение под ваш ритм</p><h1>Настройки</h1><p className="subtitle">Рабочие часы, лимиты, внешний вид и ваши данные.</p></div></div>
      <div className="dashboard-grid">
        <section className="card span-7">
          <div className="section-title" style={{ marginTop: 0 }}><h2>Основное</h2><Save size={19} color="var(--text-soft)" /></div>
          <form className="form-grid" onSubmit={submit}>
            <div className="form-row">
              <div className="field"><label htmlFor="settings-name">Как к вам обращаться</label><input id="settings-name" className="input" value={name} onChange={(event) => setName(event.target.value)} /></div>
              <div className="field"><label htmlFor="settings-currency">Валюта</label><AppSelect id="settings-currency" className="select" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="TJS">Сомони — TJS</option><option value="USD">Доллары — USD</option><option value="RUB">Рубли — RUB</option></AppSelect></div>
            </div>
            <div className="form-row">
              <div className="field"><label htmlFor="settings-work-start">Начало рабочего дня</label><input id="settings-work-start" className="input" type="time" value={workStart} onChange={(event) => setWorkStart(event.target.value)} /></div>
              <div className="field"><label htmlFor="settings-work-end">Конец рабочего дня</label><input id="settings-work-end" className="input" type="time" value={workEnd} onChange={(event) => setWorkEnd(event.target.value)} /></div>
            </div>
            <div className="form-row">
              <div className="field"><label htmlFor="settings-daily">Дневной лимит</label><input id="settings-daily" className="input" type="number" min={0} step={100} value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} /></div>
              <div className="field"><label htmlFor="settings-monthly">Месячный лимит</label><input id="settings-monthly" className="input" type="number" min={0} step={1000} value={monthlyLimit} onChange={(event) => setMonthlyLimit(Number(event.target.value))} /></div>
            </div>
            <div className="field"><label htmlFor="settings-cushion">Неприкосновенная подушка</label><input id="settings-cushion" className="input" type="number" min={0} step={500} value={cushion} onChange={(event) => setCushion(Number(event.target.value))} /><span className="micro muted">Вычитается перед расчётом «безопасно потратить».</span></div>
            <div className="field"><label htmlFor="settings-timezone">Часовой пояс</label><input id="settings-timezone" className="input" value={timezone} onChange={e => setTimezone(e.target.value)} /><span className="micro muted">Например Asia/Dushanbe или Europe/Moscow</span></div>
            <div className="form-row"><div className="field"><label htmlFor="settings-goal">Цель прибыли агентства за месяц</label><input id="settings-goal" className="input" type="number" min="0" step="0.01" value={agencyGoal} onChange={e => setAgencyGoal(Number(e.target.value))} /></div><div className="field"><label htmlFor="settings-goal-currency">Валюта цели</label><AppSelect id="settings-goal-currency" className="select" value={goalCurrency} onChange={e => setGoalCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</AppSelect></div></div>
            <button className="button button-primary" type="submit" disabled={update.isPending}><Save size={17} />{update.isPending ? "Сохраняем…" : "Сохранить настройки"}</button>
          </form>
        </section>

        <section className="card span-5">
          <div className="section-title" style={{ marginTop: 0 }}><h2>Внешний вид и план</h2>{data.settings?.theme === "dark" ? <Moon size={20} /> : <Sun size={20} />}</div>
          <div className="switch-row"><div><strong className="small">Тёмная тема</strong><p className="micro muted" style={{ margin: 0 }}>Те же цветовые токены, мягкий графит</p></div><button className={`switch ${data.settings?.theme === "dark" ? "on" : ""}`} type="button" role="switch" aria-checked={data.settings?.theme === "dark"} onClick={() => changeTheme(data.settings?.theme === "dark" ? "light" : "dark")} aria-label="Тёмная тема" /></div>
          <div className="switch-row"><div><strong className="small">Автоматически сдвигать план</strong><p className="micro muted" style={{ margin: 0 }}>Если выключено, пересборка запускается вручную</p></div><button className={`switch ${data.settings?.autoReflow ? "on" : ""}`} type="button" role="switch" aria-checked={data.settings?.autoReflow ?? false} onClick={() => update.mutate({ autoReflow: !data.settings?.autoReflow })} aria-label="Автоматически сдвигать план" /></div>
          <div className="accent-card" style={{ padding: 15, borderRadius: 18, marginTop: 14 }}><p className="small" style={{ margin: 0 }}>Фиксированные события не двигаются ни в одном режиме.</p></div>
          <h3>Ваши модули</h3>
          {([['agencyEnabled', 'Агентство'], ['goldEnabled', 'Золото'], ['debtsEnabled', 'Долги']] as const).map(([key, label]) => <div className="switch-row" key={key}><div><strong className="small">{label}</strong><p className="micro muted" style={{ margin: 0 }}>Данные сохранятся при отключении</p></div><button className={`switch ${data.settings?.[key] !== false ? "on" : ""}`} type="button" role="switch" aria-checked={data.settings?.[key] !== false} aria-label={label} onClick={() => update.mutate({ [key]: !(data.settings?.[key] ?? true) })} /></div>)}
        </section>

        <section className="card span-7">
          <div className="section-title" style={{ marginTop: 0 }}><h2>Экспорт данных</h2><Download size={20} color="var(--text-soft)" /></div>
          <p className="small muted">Скачайте задачи, проекты, операции и записи дневника в открытых форматах. Экспорт создаётся по текущему состоянию базы.</p>
          <div className="action-row"><button className="button button-ghost" type="button" onClick={exportJson} disabled={exportQuery.isFetching}><Download size={16} />{exportQuery.isFetching ? "Готовим…" : "Скачать JSON"}</button><button className="button button-ghost" type="button" onClick={exportCsv}><Download size={16} />Скачать CSV</button></div>
        </section>

        <section className="card span-5">
          <div className="section-title" style={{ marginTop: 0 }}><h2>Сеанс и доступ</h2><ShieldCheck size={20} color="var(--success)" /></div>
          <p className="small"><span className="dot" style={{ display: "inline-block", marginRight: 7, background: online ? "var(--success)" : "var(--danger)" }} />{online ? "Соединение активно" : "Офлайн-режим"}</p>
          <p className="small muted">Вход защищён паролем, сессия хранится в httpOnly cookie. Для смены пароля задайте PLANNER_PASSWORD на сервере.</p>
          <button className="button button-danger" type="button" onClick={() => { refresh(); logout.mutate(); }} disabled={logout.isPending}><LogOut size={16} />Выйти из ежедневника</button>
        </section>
      </div>
    </div>
  );
}
