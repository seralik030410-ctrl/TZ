import { useState } from "react";
import { useOutletContext } from "react-router";
import { ArrowUpRight, BriefcaseBusiness, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import type { LayoutContext } from "@/lib/planner";
import { Modal } from "@/components/Modal";
import { HistoryChart } from "@/components/HistoryChart";
import { RecordForm, ModuleHeader, Metric, Ring, Empty, SearchField, LoadingError } from "@/components/ModuleKit";
import { options, currencyField, useModuleCache, moduleMutation, type Field } from "@/lib/moduleData";
import { agencyWriteSchema, clientSchema, dealSchema, paymentSchema, checklistSchema, visaSchema, flightSchema, agencyTotals, agencyProfitTrend, outstanding, dealProfit, agencyEvents } from "@contracts/agency";
import { dayInZone, daysLeftInMonth, moneyText } from "@contracts/shared";

const dealStatuses = { lead: "Заявка", working: "В работе", paid: "Оплачено", completed: "Завершено", cancelled: "Отменено" };
const visaStatuses = { documents: "Документы", submitted: "Подано", waiting: "Ожидание", approved: "Одобрено", rejected: "Отказ" };
type Entity = "clients" | "deals" | "payments" | "checklist" | "visas" | "flights";
const schemas = { clients: clientSchema, deals: dealSchema, payments: paymentSchema, checklist: checklistSchema, visas: visaSchema, flights: flightSchema };
const labels = { clients: "Клиент", deals: "Сделка", payments: "Платёж", checklist: "Пункт чек-листа", visas: "Виза", flights: "Авиабилет" };

export default function Agency() {
  const { data: planner } = useOutletContext<LayoutContext>();
  const enabled = planner.settings?.agencyEnabled ?? true;
  const query = trpc.agency.list.useQuery(undefined, { enabled, refetchOnWindowFocus: false });
  const [data, setData] = useModuleCache("agency", query.data);
  const [tab, setTab] = useState<Entity>("deals");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ entity: Entity; initial?: Record<string, unknown> } | null>(null);
  const [detail, setDetail] = useState<{ entity: "deals" | "clients"; id: string } | null>(null);
  const today = dayInZone(new Date(), planner.settings?.timezone);
  const currency = planner.settings?.agencyGoalCurrency ?? "TJS";
  const goal = planner.settings?.agencyGoal ?? 10000000;
  if (!enabled) return <div className="page"><Empty>Агентство отключено. Включите модуль в настройках.</Empty></div>;
  if (!data) return <div className="page"><LoadingError error={query.isError} retry={() => void query.refetch()} /></div>;
  const totals = agencyTotals(data.deals, data.payments, today.slice(0, 7));
  const profitTrend = agencyProfitTrend(data.deals, today, currency);
  const events = agencyEvents(data.deals.filter(d => outstanding(d.sale, data.payments.filter(p => p.dealId === d.id)) > 0 || !d.paymentDue).map(d => d), data.visas, data.flights, today, false, planner.settings?.timezone);
  const paidFor = (id: string) => data.payments.filter(p => p.dealId === id).reduce((s, p) => s + p.amount, 0);
  const fieldsFor = (entity: Entity, initial?: Record<string, unknown>): Field[] => {
    const dealField: Field = { key: "dealId", label: "Сделка", options: data.deals.map(d => ({ value: d.id, label: d.title })), required: true };
    switch (entity) {
      case "clients": return [{ key: "name", label: "Имя клиента", required: true }, { key: "phone", label: "Телефон" }, { key: "messenger", label: "Мессенджер" }, { key: "source", label: "Откуда пришёл" }, { key: "notes", label: "Заметки", type: "textarea" }];
      case "deals": return [
        { key: "clientId", label: "Клиент", options: data.clients.map(c => ({ value: c.id, label: c.name })), required: true },
        { key: "type", label: "Услуга", options: options({ tour: "Тур", visa: "Виза", flight: "Авиабилет", other: "Другое" }), value: "tour", required: true },
        { key: "title", label: "Название или направление", required: true }, { key: "status", label: "Статус", options: options(dealStatuses), value: "lead", required: true },
        { key: "requestedOn", label: "Дата заявки", type: "date", value: today, required: true }, { key: "paymentDue", label: "Срок оплаты", type: "date" },
        { key: "departureOn", label: "Вылет", type: "date" }, { key: "returnOn", label: "Возвращение", type: "date" }, { key: "completedOn", label: "Дата завершения", type: "date", hint: "Для прибыли за месяц; обязательно при завершении" },
        { key: "sale", label: "Сумма продажи", type: "money", value: "0", required: true }, { key: "cost", label: "Себестоимость", type: "money", value: "0", required: true },
        { key: "commission", label: "Комиссия (справочно)", type: "money", value: "0", hint: "Прибыль = продажа − себестоимость" }, currencyField,
      ];
      case "payments": return [dealField, { key: "amount", label: "Сумма платежа", type: "money", required: true }, { ...currencyField, value: data.deals.find(d => d.id === initial?.dealId)?.currency ?? currency }, { key: "date", label: "Дата", type: "date", value: today, required: true }, { key: "method", label: "Способ", value: "Перевод", required: true }];
      case "checklist": return [dealField, { key: "title", label: "Что нужно сделать", required: true }, { key: "done", label: "Выполнено", type: "checkbox" }];
      case "visas": return [dealField, { key: "country", label: "Страна", required: true }, { key: "type", label: "Тип визы", required: true }, { key: "status", label: "Статус", options: options(visaStatuses), value: "documents", required: true }, { key: "submissionOn", label: "Срок / дата подачи", type: "date" }, { key: "readyOn", label: "Дата готовности", type: "date" }];
      case "flights": return [dealField, { key: "route", label: "Маршрут", required: true }, { key: "airline", label: "Авиакомпания", required: true }, { key: "booking", label: "Номер брони" }, { key: "departureAt", label: "Дата и время вылета", type: "datetime-local", required: true, hint: planner.settings?.timezone ?? "Asia/Dushanbe" }, { key: "passengers", label: "Пассажиры", required: true }];
    }
  };
  const save = async (entity: Entity, value: Record<string, unknown>, mode: "create" | "update" = "create") => {
    const record = agencyWriteSchema.parse({ entity, data: value });
    await moduleMutation("agency.save", { record, mode });
    const rows = data[entity] as { id: string }[];
    setData({ ...data, [entity]: [...rows.filter(r => r.id !== record.data.id), { ...record.data, updatedAt: new Date(), isDeleted: false }] });
    if (navigator.onLine) await query.refetch();
  };
  const remove = async (entity: Entity, id: string) => {
    try { await moduleMutation("agency.remove", { entity, id }); setData({ ...data, [entity]: data[entity].filter(x => x.id !== id) }); setDetail(null); if (navigator.onLine) await query.refetch(); } catch (e) { toast.error((e as Error).message); }
  };
  const selectedDeal = detail?.entity === "deals" ? data.deals.find(d => d.id === detail.id) : null;
  const selectedClient = detail?.entity === "clients" ? data.clients.find(c => c.id === detail.id) : null;
  const displayMoney = (key: "profit" | "receivable") => Object.entries(totals).length ? Object.entries(totals).map(([c, t]) => <div key={c}>{moneyText(t[key], c)}</div>) : moneyText(0, currency);
  return <div className="page">
    <ModuleHeader title="Агентство" eyebrow="От первого обращения до возвращения домой" subtitle="Клиенты, поездки и финансы — всё в одном маршруте." data={data} onAdd={() => { if (tab !== "clients" && !data.clients.length) setForm({ entity: "clients" }); else setForm({ entity: tab }); }} addLabel={tab === "clients" ? "Новый клиент" : tab === "deals" ? "Новая сделка" : "Добавить"} />
    <div className="module-hero stagger"><div className="module-summary"><Metric label="Прибыль за месяц" value={displayMoney("profit")} hint="По завершённым сделкам" accent /><Metric label="Нужно собрать с клиентов" value={displayMoney("receivable")} hint="Остаток по активным сделкам" /><Metric label="Активные поездки" value={data.deals.filter(d => !["completed", "cancelled"].includes(d.status)).length} hint="От заявки до завершения" /><Metric label="Клиенты агентства" value={data.clients.length} hint="Каждый контакт и его история" /></div><section className="card"><p className="card-label">Цель прибыли · {currency}</p><Ring percent={goal ? (totals[currency]?.profit ?? 0) / goal * 100 : 0} label="цели месяца" detail={`Нужно ${moneyText(Math.ceil(Math.max(0, goal - (totals[currency]?.profit ?? 0)) / daysLeftInMonth(today)), currency)} в день`} /><p className="micro muted">Цель {moneyText(goal, currency)} · изменить в настройках</p></section></div>
    <section className="card"><div className="section-title" style={{ margin: 0 }}><div><p className="eyebrow">Каждая заявка на своём месте</p><h2>Воронка сделок</h2></div><BriefcaseBusiness size={20} color="var(--accent)" /></div><div className="module-funnel">{Object.entries(dealStatuses).map(([status, label]) => { const rows = data.deals.filter(d => d.status === status); return <div key={status}><p>{label}</p><strong className="number">{rows.length}</strong>{[...new Set(rows.map(d => d.currency))].map(c => <p key={c}>{moneyText(rows.filter(d => d.currency === c).reduce((s, d) => s + d.sale, 0), c)}</p>)}<div className="progress-bar"><div style={{ width: `${rows.length / Math.max(1, data.deals.length) * 100}%` }} /></div></div>; })}</div></section>
    <section className="card"><div className="section-title"><div><p className="eyebrow">Завершённые сделки · {currency}</p><h2>Прибыль за 30 дней</h2></div><span className="badge">по дате завершения</span></div>{profitTrend.some(point => point.amount !== 0) ? <HistoryChart points={profitTrend} currency={currency} label="Прибыль за день" /> : <p className="muted small">График появится после завершения первой сделки в этой валюте.</p>}</section>
    <section className="card" style={{ marginTop: 18 }}><div className="section-title" style={{ margin: 0 }}><h2>Ближайшие события</h2><span className="badge">30 дней</span></div>{events.length ? <div className="module-events">{events.slice(0, 8).map(e => <div className="module-event" key={e.id}><div className="date-tile"><span>{new Date(`${e.date}T12:00:00`).toLocaleDateString("ru", { month: "short" })}</span><strong>{e.date.slice(8)}</strong></div><div><strong className="small">{e.title}</strong><p className="micro muted" style={{ margin: 0 }}>{e.date}</p></div></div>)}</div> : <p className="small muted">Здесь появятся вылеты, оплаты и визовые сроки.</p>}</section>
    <div className="module-toolbar"><div className="module-tabs" role="tablist" aria-label="Разделы агентства">{([['deals', 'Сделки'], ['clients', 'Клиенты'], ['visas', 'Визы'], ['flights', 'Авиабилеты']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label} <span className="muted">{data[key].length}</span></button>)}</div><SearchField value={search} onChange={setSearch} placeholder="Найти запись…" /></div>
    <div className="module-list stagger">{(data[tab] as unknown as Record<string, unknown>[]).filter(r => JSON.stringify(r).toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(r => {
      const id = String(r.id); const client = data.clients.find(c => c.id === r.clientId); const deal = data.deals.find(d => d.id === r.dealId);
      return <button key={id} className="card card-interactive module-record" onClick={() => tab === "clients" || tab === "deals" ? setDetail({ entity: tab, id }) : setForm({ entity: tab, initial: r })}><div className="section-title"><span className="module-avatar">{String(r.name ?? r.title ?? r.country ?? r.route).slice(0, 2).toUpperCase()}</span><span className="badge">{tab === "deals" ? dealStatuses[r.status as keyof typeof dealStatuses] : tab === "visas" ? visaStatuses[r.status as keyof typeof visaStatuses] : tab === "clients" ? "Клиент" : "Билет"}</span></div><h3>{String(r.title ?? r.name ?? r.country ?? r.route)}</h3><p className="small muted" style={{ margin: 0 }}>{client?.name ?? deal?.title ?? String(r.phone || r.messenger || r.source || "Контакт сохранён")}</p><div className="module-record-footer"><strong>{tab === "deals" ? moneyText(Number(r.sale), String(r.currency)) : String(r.departureOn ?? r.submissionOn ?? r.departureAt ?? "Открыть историю")}</strong><ArrowUpRight size={18} /></div></button>;
    })}</div>{!data[tab].length && <section className="card"><Empty>{tab === "clients" ? "Добавьте первого клиента — и его история будет всегда под рукой." : "Добавьте запись кнопкой вверху. Начните с клиента, затем создайте сделку."}</Empty></section>}
    {selectedDeal && <Modal title={selectedDeal.title} onClose={() => setDetail(null)}><div className="module-detail"><div className="module-summary"><Metric label="Прибыль сделки" value={moneyText(dealProfit(selectedDeal), selectedDeal.currency)} /><Metric label="Осталось оплатить" value={moneyText(outstanding(selectedDeal.sale, data.payments.filter(p => p.dealId === selectedDeal.id)), selectedDeal.currency)} /></div><p className="small muted">{data.clients.find(c => c.id === selectedDeal.clientId)?.name} · {dealStatuses[selectedDeal.status as keyof typeof dealStatuses]}</p><div className="action-row"><button className="button button-ghost" onClick={() => { setDetail(null); setForm({ entity: "deals", initial: selectedDeal }); }}>Редактировать</button><button className="button button-danger" onClick={() => void remove("deals", selectedDeal.id)}><Trash2 size={16} />Удалить</button></div>
      <section><div className="section-title"><h3>Чек-лист</h3><button className="text-button" onClick={() => { setDetail(null); setForm({ entity: "checklist", initial: { dealId: selectedDeal.id } }); }}><Plus size={15} />Добавить</button></div>{data.checklist.filter(c => c.dealId === selectedDeal.id).map(c => <div className="list-row" key={c.id}><button className={`task-check ${c.done ? "checked" : ""}`} aria-label={`${c.done ? "Снять отметку" : "Выполнить"}: ${c.title}`} onClick={() => void save("checklist", { ...c, done: !c.done }, "update").catch(e => toast.error(e.message))}>{c.done && <Check size={14} />}</button><span className="list-row-main">{c.title}</span><button className="icon-button" aria-label="Удалить пункт" onClick={() => void remove("checklist", c.id)}><Trash2 size={15} /></button></div>)}</section>
      <section><div className="section-title"><h3>Платежи клиента</h3><button className="text-button" onClick={() => { setDetail(null); setForm({ entity: "payments", initial: { dealId: selectedDeal.id, currency: selectedDeal.currency } }); }}>+ Платёж</button></div>{data.payments.filter(p => p.dealId === selectedDeal.id).map(p => <div className="list-row" key={p.id}><div className="list-row-main"><strong>{moneyText(p.amount, p.currency)}</strong><span>{p.date} · {p.method}</span></div><button className="icon-button" aria-label="Удалить платёж" onClick={() => void remove("payments", p.id)}><Trash2 size={15} /></button></div>)}</section>
      {(["visas", "flights"] as const).map(entity => <section key={entity}><div className="section-title"><h3>{entity === "visas" ? "Визы" : "Авиабилеты"}</h3><button className="text-button" onClick={() => { setDetail(null); setForm({ entity, initial: { dealId: selectedDeal.id } }); }}>+ Добавить</button></div>{data[entity].filter(r => r.dealId === selectedDeal.id).map(r => <button className="button button-ghost" key={r.id} onClick={() => { setDetail(null); setForm({ entity, initial: r }); }}>{"country" in r ? `${r.country} · ${visaStatuses[r.status as keyof typeof visaStatuses]}` : `${r.route} · ${r.departureAt}`}</button>)}</section>)}
    </div></Modal>}
    {selectedClient && <Modal title={selectedClient.name} onClose={() => setDetail(null)}><div className="module-detail"><dl><div><dt>Телефон</dt><dd>{selectedClient.phone || "—"}</dd></div><div><dt>Мессенджер</dt><dd>{selectedClient.messenger || "—"}</dd></div><div><dt>Источник</dt><dd>{selectedClient.source || "—"}</dd></div></dl><p className="small">{selectedClient.notes}</p><h3>История сделок</h3>{[...new Set(data.deals.filter(d => d.clientId === selectedClient.id && d.status !== "cancelled").map(d => d.currency))].map(c => { const rows = data.deals.filter(d => d.clientId === selectedClient.id && d.currency === c && d.status !== "cancelled"); return <div className="accent-card card" key={c}><p>Всего {moneyText(rows.reduce((s, d) => s + d.sale, 0), c)}</p><p>Оплачено {moneyText(rows.reduce((s, d) => s + paidFor(d.id), 0), c)}</p><strong>Долг {moneyText(rows.reduce((s, d) => s + outstanding(d.sale, data.payments.filter(p => p.dealId === d.id)), 0), c)}</strong></div>; })}{data.deals.filter(d => d.clientId === selectedClient.id).map(d => <button className="button button-ghost" key={d.id} onClick={() => setDetail({ entity: "deals", id: d.id })}>{d.title} · {moneyText(d.sale, d.currency)}</button>)}<div className="action-row"><button className="button button-ghost" onClick={() => { setDetail(null); setForm({ entity: "clients", initial: selectedClient }); }}>Редактировать</button><button className="button button-danger" onClick={() => void remove("clients", selectedClient.id)}>Удалить</button><button className="button button-primary" onClick={() => { setDetail(null); setForm({ entity: "deals", initial: { clientId: selectedClient.id } }); }}>Новая сделка</button></div></div></Modal>}
    {form && <RecordForm title={labels[form.entity]} fields={fieldsFor(form.entity, form.initial)} initial={form.initial} schema={schemas[form.entity]} onClose={() => setForm(null)} onSave={v => save(form.entity, v, form.initial?.id ? "update" : "create")} />}
  </div>;
}
