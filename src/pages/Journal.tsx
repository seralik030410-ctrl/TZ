import { DateField } from "@/components/FormControls";
import { normalizeCurrency } from "@contracts/shared";
import { DayClosureHistory } from "@/components/Routines";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";
import { BookOpen, CalendarDays, CheckCircle2, Save, Search, Sparkles, Timer, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { formatDate, formatDuration, formatMoney, localDayKey, type LayoutContext } from "@/lib/planner";

export default function Journal() {
  const context = useOutletContext<LayoutContext>();
  const data = { ...context.data, transactions: context.data.transactions.filter(t => t.currency === normalizeCurrency(context.data.settings?.currency)) };
  const utils = trpc.useUtils();
  const [date, setDate] = useState(localDayKey());
  const [search, setSearch] = useState("");
  const existing = data.journal.find((entry) => entry.date === date);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [done, setDone] = useState("");
  const [failed, setFailed] = useState("");
  const [insight, setInsight] = useState("");
  const [gratitude, setGratitude] = useState("");
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    setMood(existing?.mood ?? 3);
    setEnergy(existing?.energy ?? 3);
    setDone(existing?.done ?? "");
    setFailed(existing?.failed ?? "");
    setInsight(existing?.insight ?? "");
    setGratitude(existing?.gratitude ?? "");
    setText(existing?.text ?? "");
    setTags(existing?.tags ?? "");
  }, [date, existing?.id]);

  const save = trpc.planner.journal.save.useMutation({
    onSuccess: async () => { await utils.planner.bootstrap.invalidate(); toast.success("Запись дня сохранена"); },
    onError: (error) => toast.error(error.message),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ date, mood, energy, done, failed, insight, gratitude, text, tags });
  };

  const completedToday = data.tasks.filter((task) => task.status === "done" && (!task.due || task.due === localDayKey())).length;
  const focusToday = data.timeLogs.filter((log) => localDayKey(log.start) === localDayKey()).reduce((sum, log) => sum + log.minutes, 0);
  const spentToday = data.transactions.filter((transaction) => transaction.kind === "expense" && localDayKey(transaction.happenedAt) === localDayKey()).reduce((sum, transaction) => sum + transaction.amount, 0);
  const entries = useMemo(() => data.journal.filter((entry) => `${entry.text ?? ""} ${entry.done ?? ""} ${entry.insight ?? ""} ${entry.tags}`.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))), [data.journal, search]);

  return (
    <div className="page">
      <DayClosureHistory />
      <div className="page-header"><div><p className="eyebrow">Замечать не только дела, но и себя</p><h1>Дневник</h1><p className="subtitle">Короткий вечерний разбор: факты уже подтянуты, останется добавить главную мысль.</p></div></div>

      <div className="dashboard-grid">
        <section className="card span-8">
          <div className="section-title" style={{ marginTop: 0 }}><div><p className="eyebrow">Вечерний шаблон</p><h2>{date === localDayKey() ? "Сегодня" : formatDate(date)}</h2></div><DateField className="input" style={{ width: "auto", minHeight: 42 }} value={date} max={localDayKey()} onChange={(event) => setDate(event.target.value)} aria-label="Дата записи" /></div>

          {date === localDayKey() && (
            <div className="stat-strip" style={{ marginBottom: 22 }}>
              <div className="card" style={{ boxShadow: "none" }}><CheckCircle2 size={17} color="var(--success)" /><p className="card-value" style={{ fontSize: 23 }}>{completedToday}</p><p className="card-label">задач сделано</p></div>
              <div className="card" style={{ boxShadow: "none" }}><Timer size={17} color="var(--accent)" /><p className="card-value" style={{ fontSize: 23 }}>{formatDuration(focusToday)}</p><p className="card-label">фокуса</p></div>
              <div className="card" style={{ boxShadow: "none" }}><WalletCards size={17} color="var(--warning)" /><p className="card-value" style={{ fontSize: 23 }}>{formatMoney(spentToday, data.settings?.currency)}</p><p className="card-label">потрачено</p></div>
              <div className="card" style={{ boxShadow: "none" }}><Sparkles size={17} color="var(--info)" /><p className="card-value" style={{ fontSize: 23 }}>{data.projects.filter((project) => data.timeLogs.some((log) => log.projectId === project.id && localDayKey(log.start) === localDayKey())).length}</p><p className="card-label">проектов сдвинуто</p></div>
            </div>
          )}

          <form className="form-grid" onSubmit={submit}>
            <div className="form-row">
              <Rating label="Настроение" value={mood} onChange={setMood} />
              <Rating label="Энергия" value={energy} onChange={setEnergy} />
            </div>
            <div className="form-row">
              <div className="field"><label htmlFor="journal-done">Что получилось?</label><textarea id="journal-done" className="textarea" value={done} onChange={(event) => setDone(event.target.value)} placeholder="Даже маленький результат важен" /></div>
              <div className="field"><label htmlFor="journal-failed">Что не получилось?</label><textarea id="journal-failed" className="textarea" value={failed} onChange={(event) => setFailed(event.target.value)} placeholder="Без самокритики, только факт" /></div>
            </div>
            <div className="field"><label htmlFor="journal-insight">Главный вывод дня</label><input id="journal-insight" className="input" value={insight} onChange={(event) => setInsight(event.target.value)} placeholder="Что стоит повторить или изменить завтра?" /></div>
            <div className="field"><label htmlFor="journal-gratitude">Одна благодарность</label><input id="journal-gratitude" className="input" value={gratitude} onChange={(event) => setGratitude(event.target.value)} placeholder="За что можно сказать спасибо?" /></div>
            <div className="field"><label htmlFor="journal-text">Свободная заметка</label><textarea id="journal-text" className="textarea" style={{ minHeight: 130 }} value={text} onChange={(event) => setText(event.target.value)} placeholder="Мысли, идеи, наблюдения…" /></div>
            <div className="field"><label htmlFor="journal-tags">Теги через запятую</label><input id="journal-tags" className="input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="фокус, учёба, идея" /></div>
            <button className="button button-primary button-wide" type="submit" disabled={save.isPending}><Save size={17} />{save.isPending ? "Сохраняем…" : "Сохранить запись дня"}</button>
          </form>
        </section>

        <section className="card span-4">
          <div className="section-title" style={{ marginTop: 0 }}><h2>Прошлые записи</h2><BookOpen size={19} color="var(--text-soft)" /></div>
          <div className="field" style={{ marginBottom: 12 }}><label htmlFor="journal-search">Поиск по дневнику</label><div style={{ position: "relative" }}><Search size={16} style={{ position: "absolute", left: 14, top: 17, color: "var(--text-soft)" }} /><input id="journal-search" className="input" style={{ paddingLeft: 40 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Слово или тег" /></div></div>
          {entries.length === 0 && <div className="empty-state"><CalendarDays size={28} /><strong>Записей не найдено</strong><p>Измените запрос или сохраните первую запись.</p></div>}
          <div className="plain-list">
            {entries.slice(0, 12).map((entry) => (
              <button className="list-row" style={{ width: "100%", border: 0, borderBottom: "1px solid var(--line)", background: "transparent", textAlign: "left" }} type="button" key={entry.id} onClick={() => setDate(entry.date)}>
                <span className="badge badge-info">{entry.energy}/5</span>
                <div className="list-row-main"><strong>{formatDate(entry.date, { day: "numeric", month: "long", year: "numeric" })}</strong><span>{entry.insight || entry.text || entry.done || "Запись дня"}</span></div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Rating({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="field"><span className="field-label">{label}: <strong style={{ color: "var(--text)" }}>{value}/5</strong></span><div className="rating">{[1, 2, 3, 4, 5].map((item) => <button key={item} type="button" className={value === item ? "active" : ""} onClick={() => onChange(item)} aria-label={`${label}: ${item} из 5`}>{item}</button>)}</div></div>
  );
}
