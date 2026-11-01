import { useNavigate } from "react-router";
import { Clock3 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import type { PlannerData } from "@/lib/planner";
import { useModuleCache } from "@/lib/moduleData";
import { agencyEvents, outstanding } from "@contracts/agency";
import { dayInZone, dayDistance, moneyText } from "@contracts/shared";
import { debtRemaining } from "@contracts/debts";
import { goldStop } from "@contracts/gold";

export function ModuleAttention({ data }: { data: PlannerData }) {
  const navigate = useNavigate();
  const query = trpc.agency.list.useQuery(undefined, { enabled: data.settings?.agencyEnabled !== false });
  const [agency] = useModuleCache("agency", query.data);
  const goldQuery = trpc.gold.list.useQuery(undefined, { enabled: data.settings?.goldEnabled !== false });
  const [gold] = useModuleCache("gold", goldQuery.data);
  const debtQuery = trpc.debts.list.useQuery(undefined, { enabled: data.settings?.debtsEnabled !== false });
  const [debts] = useModuleCache("debts", debtQuery.data);
  const today = dayInZone(new Date(), data.settings?.timezone);
  const events = data.settings?.agencyEnabled !== false && agency ? agencyEvents(agency.deals.map(d => ({ ...d, paymentDue: outstanding(d.sale, agency.payments.filter(p => p.dealId === d.id)) ? d.paymentDue : null })), agency.visas, agency.flights, today, true, data.settings?.timezone) : [];
  const stops = data.settings?.goldEnabled !== false && gold ? gold.rules.filter(rule => { const stop = goldStop(gold.trades.filter(t => t.currency === rule.currency), rule, new Date(), data.settings?.timezone); return stop.blocked && !gold.overrides.some(o => o.stateKey === stop.key && Date.parse(o.until) > Date.now()); }).map(rule => ({ id: `gold-${rule.currency}`, title: `Стоп на сегодня · ${rule.currency}`, date: "Соблюдайте лимиты и дайте себе паузу", path: "/gold" })) : [];
  const dueDebts = data.settings?.debtsEnabled !== false && debts ? debts.debts.filter(d => d.status === "open" && d.dueOn && dayDistance(today, d.dueOn) <= 3 && debtRemaining(d.amount, debts.payments.filter(p => p.debtId === d.id)) > 0).map(d => ({ id: `debt-${d.id}`, title: `${d.direction === "i_owe" ? "Вернуть" : "Получить"} · ${d.counterparty}`, date: `${d.dueOn} · ${moneyText(debtRemaining(d.amount, debts.payments.filter(p => p.debtId === d.id)), d.currency)}`, path: "/debts" })) : [];
  return <>{[...events, ...stops, ...dueDebts].map(e => <button className="attention-item module-attention" key={e.id} onClick={() => navigate(e.path)}><Clock3 size={17} color="var(--accent)" /><span className="list-row-main"><strong>{e.title}</strong><span>{e.date}</span></span></button>)}</>;
}
