import { tradeFormSchema } from "@contracts/gold";
import { useState, useEffect } from "react";
import { useOutletContext } from "react-router";
import { ShieldCheck, LockKeyhole, Settings2, ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { trpc } from "@/providers/trpc";
import type { LayoutContext } from "@/lib/planner";
import { HistoryChart } from "@/components/HistoryChart";
import { ModuleHeader, Metric, Empty, LoadingError, RecordForm } from "@/components/ModuleKit";
import { currencies, currencyField, options, useModuleCache, moduleMutation, type Field } from "@/lib/moduleData";
import { tradeSchema, transferSchema, balanceSchema, rulesSchema, goldWriteSchema, goldStats, goldStop, returnRate, dayRate, netResult, closeTime } from "@contracts/gold";
import { dayInZone, dayDistance, moneyText } from "@contracts/shared";

type Entity = "trades" | "transfers" | "balances" | "rules";
const schemas = { trades: tradeSchema, transfers: transferSchema, balances: balanceSchema, rules: rulesSchema };
export default function Gold() {
  const { data: planner } = useOutletContext<LayoutContext>();
  const enabled = planner.settings?.goldEnabled !== false;
  const query = trpc.gold.list.useQuery(undefined, { enabled, refetchOnWindowFocus: false });
  const [data, setData] = useModuleCache("gold", query.data);
  const [currency, setCurrency] = useState("USD");
  const [period, setPeriod] = useState("today");
  const [form, setForm] = useState<{ entity: Entity; initial?: Record<string, unknown> } | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [quickResult, setQuickResult] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(id); }, []);
  const saveRules = trpc.gold.save.useMutation();
  const override = trpc.gold.override.useMutation();
  const timezone = planner.settings?.timezone ?? "Asia/Dushanbe";
  const today = dayInZone(now, timezone);
  if (!enabled) return <div className="page"><Empty>Золото отключено. Включите модуль в настройках.</Empty></div>;
  if (!data) return <div className="page"><LoadingError error={query.isError} retry={() => void query.refetch()} /></div>;
  const trades = data.trades.filter(t => t.currency === currency);
  const balances = data.balances.filter(t => t.currency === currency).sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.getTime() - b.updatedAt.getTime());
  const transfers = data.transfers.filter(t => t.currency === currency);
  const invested = transfers.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0);
  const withdrawn = transfers.filter(t => t.type === "withdrawal").reduce((s, t) => s + t.amount, 0);
  const balance = balances.filter(b => b.date <= today).at(-1)?.amount ?? null;
  const priorDay = new Date(`${today}T12:00:00Z`); priorDay.setUTCDate(priorDay.getUTCDate() - 1);
  const starting = balances.filter(b => b.date === priorDay.toISOString().slice(0, 10)).at(-1)?.amount ?? null;
  const todayTrades = trades.filter(t => dayInZone(new Date(closeTime(t)), timezone) === today);
  const todayNet = goldStats(todayTrades, timezone).net;
  const rule = data.rules.find(r => r.currency === currency);
  const stop = rule ? goldStop(trades, rule, now, timezone) : null;
  const unlocked = stop?.blocked && data.overrides.some(o => o.currency === currency && o.stateKey === stop.key && Date.parse(o.until) > now.getTime());
  const blocked = Boolean(stop?.blocked && !unlocked);
  const stats = goldStats(trades, timezone);
  const percent = (v: number | null) => v === null ? "Нет данных" : `${v.toLocaleString("ru", { maximumFractionDigits: 2 })}%`;
  const filtered = trades.filter(t => { const day = dayInZone(new Date(t.date), timezone); return period === "all" || period === "today" && day === today || period === "week" && dayDistance(day, today) >= 0 && dayDistance(day, today) < 7 || period === "month" && day.startsWith(today.slice(0, 7)); }).sort((a, b) => b.date.localeCompare(a.date));
  const openForm = (entity: Entity, initial?: Record<string, unknown>) => setForm({ entity, initial });
  const fieldDate: Field = { key: "date", label: "Дата", type: "date", value: today, required: true };
  const fieldsFor = (entity: Entity): Field[] => {
    const fullTrade = form?.initial?.status !== "closed";
    switch (entity) {
      case "trades": return [
        { key: "date", label: "Дата и время входа", type: "datetime-local", value: now.toISOString(), required: true, hint: timezone },
        { key: "direction", label: "Направление", options: options({ buy: "Покупка", sell: "Продажа" }), value: "buy", required: fullTrade },
        { key: "instrument", label: "Инструмент", value: "XAU/USD", required: true }, { key: "size", label: "Размер позиции", type: "decimal", value: "0.01", required: fullTrade },
        { key: "entry", label: "Цена входа", type: "decimal", required: fullTrade }, { key: "exit", label: "Цена выхода", type: "decimal", hint: "Для открытой сделки оставьте пустым" },
        { key: "result", label: "Результат до комиссии", type: "money", value: "0", required: true, hint: "Убыток вводите со знаком минус" }, { key: "commission", label: "Комиссия", type: "money", value: "0", required: true },
        { ...currencyField, value: currency }, { key: "riskPercent", label: "Риск на сделку, %", type: "decimal", value: "1", required: fullTrade },
        { key: "state", label: "Моё состояние", options: options({ not_recorded: "Не записано", calm: "Спокоен", rush: "Спешка", tilt: "Тильт" }), value: "not_recorded" },
        { key: "status", label: "Статус", options: options({ open: "Открыта", closed: "Закрыта" }), value: "open", required: true }, { key: "reason", label: "Причина входа", required: fullTrade }, { key: "comment", label: "Разбор и комментарий", type: "textarea" },
      ];
      case "transfers": return [{ key: "type", label: "Операция", options: options({ deposit: "Пополнение", withdrawal: "Вывод" }), value: "deposit", required: true }, { key: "amount", label: "Сумма", type: "money", required: true }, { ...currencyField, value: currency }, fieldDate, { key: "note", label: "Заметка", type: "textarea" }];
      case "balances": return [fieldDate, { key: "amount", label: "Баланс на конец дня", type: "money", required: true }, { ...currencyField, value: currency }];
      case "rules": return [{ ...currencyField, value: currency }, { key: "dailyLoss", label: "Дневной лимит убытка", type: "money", value: "100", required: true }, { key: "dailyGoal", label: "Цель прибыли за день", type: "money", value: "200", required: true }, { key: "maxTrades", label: "Максимум сделок в день", type: "number", value: 5, required: true }, { key: "maxRiskPercent", label: "Максимальный риск, %", type: "decimal", value: "2", required: true }, { key: "pauseAfter", label: "Пауза после N убытков подряд", type: "number", value: 3, required: true }, { key: "pauseMinutes", label: "Длительность паузы, минут", type: "number", value: 60, required: true }, { key: "phrase", label: "Кодовая фраза", type: "password", required: !rule, hint: rule ? "Оставьте пустым, чтобы сохранить прежнюю" : "Минимум 4 символа. Сохранение правил требует сети." }];
    }
  };
  const save = async (entity: Entity, value: Record<string, unknown>) => {
    if (entity === "trades" && value.exit === "") value.exit = null;
    if (entity === "rules" && value.phrase === "") delete value.phrase;
    const record = goldWriteSchema.parse({ entity, data: value });
    const mode = form?.initial?.id ? "update" as const : "create" as const;
    if (entity === "rules") { if (!navigator.onLine) throw new Error("Подключитесь к сети, чтобы сохранить кодовую фразу"); await saveRules.mutateAsync({ record, mode }); await query.refetch(); return; }
    await moduleMutation("gold.save", { record, mode });
    setData({ ...data, [entity]: [...data[entity].filter(r => r.id !== record.data.id), { ...record.data, updatedAt: new Date(), isDeleted: false }] });
    if (navigator.onLine) await query.refetch();
  };
  const remove = async (entity: "trades" | "balances" | "transfers", id: string) => { try { await moduleMutation("gold.remove", { entity, id }); setData({ ...data, [entity]: data[entity].filter(r => r.id !== id) }); setForm(null); if (navigator.onLine) await query.refetch(); } catch (e) { toast.error((e as Error).message); } };
  return <div className="page"><ModuleHeader title="Золото" eyebrow="Сначала дисциплина. Потом результат." subtitle="Журнал XAU/USD: решения, риск и честная статистика." data={data} onAdd={!blocked && rule ? () => openForm("trades") : undefined} addLabel="Новая сделка" />
    <div className="module-toolbar"><div className="module-tabs" role="tablist" aria-label="Валюта счёта">{currencies.map(c => <button role="tab" key={c} aria-selected={currency === c} onClick={() => setCurrency(c)}>{c}</button>)}</div><button className="button button-ghost" onClick={() => openForm("rules", rule)}><Settings2 size={16} />Лимиты и правила</button></div>
    <button className="button button-primary" type="button" style={{ marginBottom: 18 }} disabled={blocked || !rule} onClick={() => setQuickResult(true)}><Plus size={18} />Записать результат</button>
    <div className="module-summary stagger"><Metric label="Вложено" value={moneyText(invested, currency)} hint="Все пополнения" /><Metric label="Выведено" value={moneyText(withdrawn, currency)} hint="Все выводы со счёта" /><Metric label="Баланс счёта" value={balance === null ? "Нет данных" : moneyText(balance, currency)} hint="Вводится вручную, без подключения к брокеру" accent /><Metric label="Доходность за всё время" value={percent(returnRate(invested, balance, withdrawn))} hint="(Баланс + выведено − вложено) / вложено" /><Metric label="Процент за сегодня" value={percent(dayRate(todayNet, starting))} hint={starting === null ? "Нужен баланс за предыдущий день" : `Начало дня: ${moneyText(starting, currency)}`} /><Metric label="Результат за сегодня" value={moneyText(todayNet, currency)} hint={`Цель: ${moneyText(rule?.dailyGoal ?? 0, currency)}`} /></div>
    <section className={`card ${blocked ? "module-stop" : "accent-card"}`}><div className="section-title" style={{ margin: 0 }}><div><p className="eyebrow">Лимит на сегодня</p><h2>{blocked ? "Стоп" : !rule ? "Начните с правил" : unlocked ? "Блокировка снята · обход записан" : "Держим свой ритм"}</h2></div>{blocked ? <LockKeyhole size={26} /> : <ShieldCheck size={26} />}</div>{rule && stop ? <><p className="small">До стопа: {moneyText(stop.remainingLoss, currency)} · Осталось сделок: {stop.remainingTrades}</p>{blocked && <><p className="small">{stop.reason} · до {new Date(stop.until!).toLocaleString("ru", { timeZone: timezone })}</p><button className="button button-danger" disabled={!navigator.onLine} onClick={() => setOverrideOpen(true)}>Снять кодовой фразой</button></>}</> : <p className="small muted">Задайте дневной лимит, риск и кодовую фразу перед первой сделкой.</p>}</section>
    <div className="module-split"><section className="card"><div className="section-title" style={{ margin: 0 }}><h2>Баланс по дням</h2><button className="text-button" onClick={() => openForm("balances")}><Plus size={16} />Баланс</button></div><HistoryChart points={Object.values(Object.fromEntries(balances.map(b => [b.date, { date: b.date, amount: b.amount }])))} currency={currency} label="Баланс" /></section><section className="card"><h2>Качество решений</h2>{[["Винрейт", percent(stats.winRate)], ["Средний плюс", moneyText(stats.averageWin, currency)], ["Средний минус", moneyText(stats.averageLoss, currency)], ["Серия убытков", String(stats.streak)], ["Лучший день", stats.best ? `${stats.best[0]} · ${moneyText(stats.best[1], currency)}` : "—"], ["Худший день", stats.worst ? `${stats.worst[0]} · ${moneyText(stats.worst[1], currency)}` : "—"]].map(([label, value]) => <div className="module-stat" key={label}><span className="muted">{label}</span><strong>{value}</strong></div>)}</section></div>
    <div className="module-toolbar"><h2>Журнал сделок</h2><div className="module-tabs" role="tablist" aria-label="Период сделок">{Object.entries({ today: "Сегодня", week: "Неделя", month: "Месяц", all: "Всё" }).map(([key, label]) => <button role="tab" key={key} aria-selected={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div></div>
    <div className="module-list stagger">{filtered.map(t => <button className="card card-interactive module-record" key={t.id} onClick={() => openForm("trades", t)}><div className="section-title"><span className="module-avatar">{t.direction === "buy" ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}</span><span className="badge">{t.status === "open" ? "Открыта" : "Закрыта"}</span></div><h3>{t.instrument} · {t.direction ? t.direction === "buy" ? "Покупка" : "Продажа" : "Результат"}</h3><p className="small muted">{new Date(t.date).toLocaleString("ru", { timeZone: timezone })} · {t.size ?? "размер не указан"} · {{ calm: "Спокоен", rush: "Спешка", tilt: "Тильт", not_recorded: "Состояние не указано" }[t.state]}</p><p className="small">{t.reason}</p><div className="module-record-footer"><span className="micro muted">{t.entry ?? "цена входа не указана"} → {t.exit ?? "цена выхода не указана"}</span><strong className={netResult(t) >= 0 ? "module-positive" : "module-negative"}>{t.status === "closed" ? moneyText(netResult(t), currency) : "В работе"}</strong></div></button>)}</div>{!filtered.length && <section className="card"><Empty>Здесь будут ваши сделки и выводы из каждой сессии.</Empty></section>}
    <section className="card" style={{ marginTop: 18 }}><div className="section-title" style={{ margin: 0 }}><h2>Пополнения и выводы</h2><button className="text-button" onClick={() => openForm("transfers")}>+ Операция</button></div>{transfers.sort((a, b) => b.date.localeCompare(a.date)).map(t => <button key={t.id} className="module-stat module-row-button" onClick={() => openForm("transfers", t)}><span>{t.date} · {t.type === "deposit" ? "Вложено" : "Выведено"}</span><strong>{moneyText(t.amount, t.currency)}</strong></button>)}{!transfers.length && <p className="small muted">Запишите пополнение, чтобы начать считать доходность.</p>}</section>
    <section className="card" style={{ marginTop: 18 }}><h2>Журнал обходов</h2>{data.overrides.filter(o => o.currency === currency).map(o => <div className="module-stat" key={o.id}><span>{new Date(o.date).toLocaleString("ru", { timeZone: timezone })}</span><strong>{o.reason}</strong></div>)}{!data.overrides.some(o => o.currency === currency) && <p className="small muted">Обходов блокировки нет.</p>}<p className="micro muted">Это журнал и контроль дисциплины. Приложение ничего не торгует.</p></section>
    {form && <><RecordForm title={{ trades: "Сделка", transfers: "Пополнение / вывод", balances: "Баланс счёта", rules: "Лимиты и правила" }[form.entity]} fields={fieldsFor(form.entity)} initial={form.initial} schema={form.entity === "trades" ? tradeFormSchema : form.entity === "rules" ? rulesSchema.extend({ phrase: z.preprocess(v => v === "" ? undefined : v, rulesSchema.shape.phrase) }) : schemas[form.entity]} onSave={v => save(form.entity, v)} onClose={() => setForm(null)} onDelete={form.initial?.id && form.entity !== "rules" ? () => void remove(form.entity as "trades" | "transfers" | "balances", String(form.initial?.id)) : undefined} /></>}
    {quickResult && <RecordForm title="Записать результат" fields={[{ key: "result", label: "Результат сделки, со знаком − или +", type: "money", required: true, hint: `Сумма в ${currency}; убыток укажите со знаком минус` }]} schema={z.object({ id: z.string().uuid(), result: z.number().int() })} onClose={() => setQuickResult(false)} onSave={async v => { await save("trades", { id: String(v.id), date: now.toISOString(), direction: null, instrument: "XAU/USD", size: null, entry: null, exit: null, result: v.result, commission: 0, currency, reason: "", state: "not_recorded", comment: "", status: "closed", riskPercent: null }); setQuickResult(false); }} />}
    {overrideOpen && <RecordForm title="Снять блокировку" fields={[{ key: "phrase", label: "Кодовая фраза", type: "password", required: true }, { key: "reason", label: "Почему я обхожу стоп", type: "textarea", required: true }]} schema={z.object({ id: z.string().uuid(), phrase: z.string().min(1), reason: z.string().trim().min(5) })} onClose={() => setOverrideOpen(false)} onSave={async v => { await override.mutateAsync({ id: String(v.id), currency: currency as "USD", phrase: String(v.phrase), reason: String(v.reason) }); await query.refetch(); toast.success("Обход записан в журнал"); }} />}
  </div>;
}
