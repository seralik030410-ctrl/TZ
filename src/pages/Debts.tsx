import { AppSelect } from "@/components/FormControls";
import { z } from "zod";
import { useState } from "react";
import { useOutletContext } from "react-router";
import { CircleDollarSign, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import type { LayoutContext } from "@/lib/planner";
import { Modal } from "@/components/Modal";
import { ModuleHeader, Metric, Ring, Empty, LoadingError, RecordForm } from "@/components/ModuleKit";
import { currencyField, options, useModuleCache, moduleMutation, type Field } from "@/lib/moduleData";
import { HistoryChart } from "@/components/HistoryChart";
import { debtSchema, debtPaymentSchema, debtsWriteSchema, debtRemaining, debtProgress, monthlyPayment, debtOverdue, debtTotals } from "@contracts/debts";
import { dayInZone, dayDistance, moneyText } from "@contracts/shared";
type Kind = "debts" | "payments";
export default function Debts() {
  const { data: planner } = useOutletContext<LayoutContext>();
  const enabled = planner.settings?.debtsEnabled !== false;
  const query = trpc.debts.list.useQuery(undefined, { enabled, refetchOnWindowFocus: false });
  const [data, setData] = useModuleCache("debts", query.data);
  const [tab, setTab] = useState("i_owe");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ kind: Kind; initial?: Record<string, unknown> } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const today = dayInZone(new Date(), planner.settings?.timezone);
  if (!enabled) return <div className="page"><Empty>Долги отключены. Включите модуль в настройках.</Empty></div>;
  if (!data) return <div className="page"><LoadingError error={query.isError} retry={() => void query.refetch()} /></div>;
  const totals = debtTotals(data.debts, data.payments);
  const remaining = (id: string) => { const debt = data.debts.find(d => d.id === id); return debt ? debtRemaining(debt.amount, data.payments.filter(p => p.debtId === id)) : 0; };
  const displayTotals = (direction: "i_owe" | "owed_to_me", key: "principal" | "paid" | "remaining") => {
    const list = Object.entries(totals[direction] ?? {});
    return list.length ? list.map(([currency, value]) => <div key={currency}>{moneyText(value[key], currency)}</div>) : <span>0</span>;
  };
  const fieldsFor = (kind: Kind): Field[] => kind === "debts" ? [
    { key: "direction", label: "Кто кому должен", options: options({ i_owe: "Я должен", owed_to_me: "Мне должны" }), value: "i_owe", required: true },
    { key: "counterparty", label: "Контрагент", required: true }, { key: "amount", label: "Сумма", type: "money", required: true }, currencyField,
    { key: "borrowedOn", label: "Дата займа", type: "date", value: today, required: true }, { key: "dueOn", label: "Срок возврата", type: "date" },
    { key: "status", label: "Статус", options: options({ open: "Открыт", closed: "Закрыт" }), value: "open", required: true }, { key: "note", label: "Заметка", type: "textarea" },
  ] : [
    { key: "debtId", label: "Долг", options: data.debts.filter(d => d.status === "open").map(d => ({ value: d.id, label: `${d.counterparty} · ${moneyText(remaining(d.id), d.currency)}` })), required: true },
    { key: "recordExpense", label: "Записать платёж в разделе Деньги", type: "checkbox", hint: "Расход, если вы должны; доход, если должны вам" }, { key: "amount", label: "Сумма платежа", type: "money", required: true }, { key: "date", label: "Дата платежа", type: "date", value: today, required: true }, { key: "note", label: "Заметка", type: "textarea" },
  ];
  const save = async (kind: Kind, value: Record<string, unknown>) => {
    const record = debtsWriteSchema.parse({ entity: kind, data: value });
    const recordExpense = Boolean(value.recordExpense);
    const mode = form?.initial?.id ? "update" as const : "create" as const;
    await moduleMutation("debts.save", { record, mode, recordExpense });
    const rows = data[kind];
    setData({ ...data, [kind]: [...rows.filter(r => r.id !== record.data.id), { ...record.data, updatedAt: new Date(), isDeleted: false }] });
    if (navigator.onLine) await query.refetch();
  };
  const remove = async (kind: Kind, id: string) => { try { await moduleMutation("debts.remove", { entity: kind, id }); setData({ ...data, [kind]: data[kind].filter(r => r.id !== id) }); setDetail(null); setForm(null); if (navigator.onLine) await query.refetch(); } catch (e) { toast.error((e as Error).message); } };
  const rows = data.debts.filter(d => tab === "closed" ? d.status === "closed" : d.direction === tab && d.status === "open").filter(d => currencyFilter === "all" || d.currency === currencyFilter).filter(d => d.counterparty.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const selected = data.debts.find(d => d.id === detail);
  const payments = selected ? data.payments.filter(p => p.debtId === selected.id).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const currencyOptions = [...new Set(data.debts.map(d => d.currency))];
  const myOweCurrencies = Object.entries(totals.i_owe ?? {});
  return <div className="page">
    <ModuleHeader title="Долги" eyebrow="Договорённости без неприятных сюрпризов" subtitle="Остаток, даты и история платежей по каждому долгу." data={data} onAdd={() => setForm({ kind: "debts" })} addLabel="Новый долг" />
    <div className="module-summary stagger"><Metric label="Всего должен" value={displayTotals("i_owe", "principal")} /><Metric label="Уже погашено" value={displayTotals("i_owe", "paid")} hint="Я должен" /><Metric label="Осталось выплатить" value={displayTotals("i_owe", "remaining")} accent /><Metric label="Мне должны" value={displayTotals("owed_to_me", "remaining")} hint="Остатки по валютам" /></div>
    <div className="module-hero"><section className="card"><p className="card-label">Прогресс погашения · я должен</p>{myOweCurrencies.length ? myOweCurrencies.map(([c, value]) => <Ring key={c} percent={value.principal ? value.paid / value.principal * 100 : 0} label={`погашено · ${c}`} detail={`${moneyText(value.paid, c)} из ${moneyText(value.principal, c)}`} />) : <p className="small muted">Добавьте долг, чтобы начать отслеживание.</p>}</section><section className="card"><div className="section-title" style={{ margin: 0 }}><div><p className="eyebrow">Сроки под контролем</p><h2>Требует внимания</h2></div><CircleDollarSign size={21} color="var(--accent)" /></div>{data.debts.filter(d => d.status === "open" && debtOverdue(d.dueOn, remaining(d.id), d.status, today)).slice(0, 4).map(d => <p className="small module-negative" key={d.id}>{d.counterparty} · просрочен на {Math.abs(dayDistance(today, d.dueOn!))} дн.</p>)}{!data.debts.some(d => d.status === "open" && debtOverdue(d.dueOn, remaining(d.id), d.status, today)) && <p className="small muted">Просроченных долгов нет.</p>}</section></div>
    <div className="module-toolbar"><div className="module-tabs" role="tablist" aria-label="Направление долга">{[["i_owe", "Я должен"], ["owed_to_me", "Мне должны"], ["closed", "Закрытые"]].map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div><div className="action-row"><AppSelect className="select" style={{ width: "auto" }} aria-label="Валюта" value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)}><option value="all">Все валюты</option>{currencyOptions.map(c => <option key={c}>{c}</option>)}</AppSelect><input className="input" style={{ maxWidth: 200 }} aria-label="Поиск контрагента" placeholder="Найти человека…" value={search} onChange={e => setSearch(e.target.value)} /></div></div>
    <div className="module-list stagger">{rows.map(debt => { const left = remaining(debt.id); const done = debt.amount - left; const overdue = debtOverdue(debt.dueOn, left, debt.status, today); const days = debt.dueOn ? dayDistance(today, debt.dueOn) : null; return <button className="card card-interactive module-record" key={debt.id} onClick={() => setDetail(debt.id)}><div className="section-title"><span className="module-avatar">{debt.counterparty.slice(0, 2).toUpperCase()}</span><span className={`badge ${overdue ? "badge-danger" : ""}`}>{debt.currency}</span></div><h3>{debt.counterparty}</h3><p className="small muted">Займ {debt.borrowedOn} · срок {debt.dueOn ?? "не указан"}</p><div className="progress-bar"><div style={{ width: `${debtProgress(debt.amount, left)}%` }} /></div><div className="module-record-footer"><strong>{moneyText(left, debt.currency)} осталось</strong><span className={`small ${overdue ? "module-negative" : "muted"}`}>{days === null ? "Без срока" : days < 0 ? `Просрочен на ${-days} дн.` : days === 0 ? "Срок сегодня" : `Осталось ${days} дн.`}</span></div><p className="micro muted">Погашено {moneyText(done, debt.currency)} из {moneyText(debt.amount, debt.currency)}</p></button>; })}</div>
    {!rows.length && <section className="card"><Empty>{tab === "closed" ? "Здесь появятся закрытые долги." : "Добавьте договорённость — сюда можно внести платёж позже."}</Empty></section>}
    {selected && <Modal title={selected.counterparty} onClose={() => setDetail(null)}><div className="module-detail"><dl><div><dt>Сумма займа</dt><dd>{moneyText(selected.amount, selected.currency)}</dd></div><div><dt>Остаток</dt><dd><strong>{moneyText(remaining(selected.id), selected.currency)}</strong></dd></div><div><dt>Дата займа</dt><dd>{selected.borrowedOn}</dd></div><div><dt>Срок возврата</dt><dd>{selected.dueOn ?? "Не указан"}</dd></div><div><dt>Прогресс</dt><dd>{debtProgress(selected.amount, remaining(selected.id))}%</dd></div><div><dt>Чтобы закрыть к сроку</dt><dd>{moneyText(monthlyPayment(remaining(selected.id), today, selected.dueOn), selected.currency)} / месяц</dd></div></dl><p className="small muted">{selected.note}</p><section className="card"><h3>Остаток после платежей</h3><HistoryChart points={(() => { let balance = selected.amount; const points = [{ date: selected.borrowedOn, amount: balance }]; for (const p of payments) { balance = Math.max(0, balance - p.amount); points.push({ date: p.date, amount: balance }); } return points; })()} currency={selected.currency} label="Остаток долга" /></section><div className="section-title"><h3>История платежей</h3><button className="button button-primary button-small" disabled={remaining(selected.id) <= 0} onClick={() => { setDetail(null); setForm({ kind: "payments", initial: { debtId: selected.id } }); }}><Plus size={15} />Платёж</button></div>{payments.map(p => <div className="list-row" key={p.id}><div className="list-row-main"><strong>{moneyText(p.amount, selected.currency)}</strong><span>{p.date}{p.note ? ` · ${p.note}` : ""}</span></div><button className="icon-button" aria-label="Удалить платёж" onClick={() => void remove("payments", p.id)}><Trash2 size={16} /></button></div>)}{!payments.length && <p className="small muted">Платежей ещё нет.</p>}<button className="button button-danger" onClick={() => void remove("debts", selected.id)}>Переместить в архив</button></div></Modal>}
    {form && <RecordForm title={form.kind === "debts" ? "Новая договорённость" : "Платёж по долгу"} fields={fieldsFor(form.kind)} initial={form.initial} schema={form.kind === "debts" ? debtSchema : debtPaymentSchema.extend({ recordExpense: z.boolean().default(false) })} onSave={v => save(form.kind, v)} onClose={() => setForm(null)} />}
  </div>;
}
