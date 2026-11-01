import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { debtRemaining } from "@contracts/debts";
import { formatMoney } from "@/lib/planner";

export function DebtSummary() {
  const query = trpc.debts.list.useQuery();
  const debts = (query.data?.debts ?? []).filter(d => d.status === "open").map(d => ({ ...d, remaining: debtRemaining(d.amount, (query.data?.payments ?? []).filter(p => p.debtId === d.id)) })).filter(d => d.remaining > 0);
  const totals = debts.reduce<Record<string, { owe: number; owed: number }>>((result, d) => {
    const row = result[d.currency] ??= { owe: 0, owed: 0 };
    row[d.direction === "i_owe" ? "owe" : "owed"] += d.remaining;
    return result;
  }, {});
  return <section className="card" style={{ marginTop: 14 }}><div className="section-title" style={{ marginTop: 0 }}><h2>Долги</h2><Link className="text-button" to="/debts">Все долги →</Link></div>
    {query.isPending ? <p className="small muted">Загружаем долги…</p> : query.isError ? <button className="text-button" onClick={() => void query.refetch()}>Не удалось загрузить. Повторить</button> : <>
      {Object.entries(totals).map(([currency, value]) => <div className="form-row" key={currency}><div><p className="small muted">Я должен</p><strong>{formatMoney(value.owe, currency)}</strong></div><div><p className="small muted">Мне должны</p><strong>{formatMoney(value.owed, currency)}</strong></div></div>)}
      {!debts.length && <p className="small muted">Открытых долгов нет.</p>}
      <div className="plain-list">{debts.filter(d => d.dueOn).sort((a,b) => a.dueOn!.localeCompare(b.dueOn!)).slice(0,3).map(d => <div className="list-row" key={d.id}><div className="list-row-main"><strong>{d.counterparty}</strong><span>{d.direction === "i_owe" ? "Вернуть" : "Получить"} до {d.dueOn}</span></div><strong>{formatMoney(d.remaining, d.currency)}</strong></div>)}</div>
    </>}
  </section>;
}
