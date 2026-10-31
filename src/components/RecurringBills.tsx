import { useState, type FormEvent } from "react";
import { CalendarClock, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { minorUnits, normalizeCurrency } from "@contracts/shared";
import { trpc } from "@/providers/trpc";
import { formatMoney, localDayKey, type LayoutContext } from "@/lib/planner";

export function RecurringBills({ data }: { data: LayoutContext["data"] }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState(1);
  const [open, setOpen] = useState(false);
  const currency = data.settings?.currency ?? "TJS";
  const month = localDayKey().slice(0, 7);
  const refresh = async () => { await utils.planner.bootstrap.invalidate(); };
  const create = trpc.planner.bills.create.useMutation({ onSuccess: async () => { await refresh(); setName(""); setAmount(""); setOpen(false); toast.success("Платёж добавлен в обязательные"); }, onError: error => toast.error(error.message) });
  const pay = trpc.planner.bills.markPaid.useMutation({ onSuccess: async result => { await refresh(); toast.success(result.alreadyPaid ? "Уже отмечен в этом месяце" : "Платёж записан в расходы"); }, onError: error => toast.error(error.message) });
  const remove = trpc.planner.bills.remove.useMutation({ onSuccess: refresh, onError: error => toast.error(error.message) });
  const submit = (event: FormEvent) => { event.preventDefault(); try { const value = minorUnits(amount.replace(",", ".")); if (value <= 0) throw new Error("Введите сумму больше нуля"); create.mutate({ id: crypto.randomUUID(), name: name.trim(), amount: value, currency: normalizeCurrency(currency), dueDay }); } catch (error) { toast.error((error as Error).message); } };
  const bills = data.recurringBills.filter(bill => bill.currency === currency).sort((a,b) => a.dueDay-b.dueDay);
  const planned = bills.filter(bill => bill.paidThrough !== month).reduce((sum,bill) => sum+bill.amount,0);
  return <section className="card recurring-bills">
    <div className="section-title" style={{ marginTop: 0 }}><div><p className="eyebrow">Фиксированные расходы</p><h2>Обязательные платежи</h2></div><span className="badge">{formatMoney(planned,currency)} осталось</span></div>
    <p className="small muted">Интернет, коммунальные услуги, аренда. Они учитываются в расчёте безопасной суммы. При отметке оплата попадёт в расходы.</p>
    {bills.length === 0 && <p className="small muted">Добавьте регулярные платежи, чтобы лимит учитывал обязательные расходы.</p>}
    <div className="plain-list">{bills.map(bill => { const paid = bill.paidThrough === month; return <div className="list-row" key={bill.id}><CalendarClock size={17} color={paid ? "var(--success)" : "var(--accent)"}/><div className="list-row-main"><strong>{bill.name}</strong><span>Каждый месяц до {bill.dueDay}-го · {paid ? "оплачено" : "ожидает оплаты"}</span></div><strong className="list-row-value">{formatMoney(bill.amount,currency)}</strong>{!paid && <button className="icon-button" type="button" title="Отметить оплаченным" aria-label={`Оплатить ${bill.name}`} onClick={() => pay.mutate({id:bill.id})}><Check size={17}/></button>}<button className="icon-button" type="button" title="Удалить платёж" aria-label={`Удалить ${bill.name}`} onClick={() => remove.mutate({id:bill.id})}><Trash2 size={15}/></button></div>; })}</div>
    {!open ? <button type="button" className="button button-ghost button-small" style={{ marginTop: 12 }} onClick={() => setOpen(true)}><Plus size={16}/>Добавить обязательный платёж</button> : <form className="form-grid" style={{ marginTop: 12 }} onSubmit={submit}><div className="form-row"><div className="field"><label htmlFor="bill-name">Название</label><input id="bill-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Интернет" required maxLength={120}/></div><div className="field"><label htmlFor="bill-amount">Сумма, {currency}</label><input id="bill-amount" className="input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0.00" required/></div></div><div className="field"><label htmlFor="bill-day">Число оплаты</label><input id="bill-day" className="input" type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(Number(e.target.value))}/></div><div className="action-row"><button className="button button-primary" type="submit" disabled={create.isPending}>{create.isPending ? "Добавляем…" : "Сохранить платёж"}</button><button className="button button-ghost" type="button" onClick={() => setOpen(false)}>Отмена</button></div></form>}
  </section>;
}
