import { z } from "zod";
import { uuid, title, note, money, currencyCode, calendarDate, optionalDate, live, dayDistance, type AttentionEvent } from "./shared";

export const clientSchema = z.object({ id: uuid, name: title, phone: z.string().max(80).default(""), messenger: z.string().max(180).default(""), source: z.string().max(180).default(""), notes: note });
export const dealSchema = z.object({ id: uuid, clientId: uuid, type: z.enum(["tour", "visa", "flight", "other"]), title, status: z.enum(["lead", "working", "paid", "completed", "cancelled"]), requestedOn: calendarDate, departureOn: optionalDate, returnOn: optionalDate, paymentDue: optionalDate, completedOn: optionalDate, sale: money, cost: money, commission: money.default(0), currency: currencyCode });
export const paymentSchema = z.object({ id: uuid, dealId: uuid, amount: money.positive(), currency: currencyCode, date: calendarDate, method: z.string().trim().min(1).max(80) });
export const checklistSchema = z.object({ id: uuid, dealId: uuid, title, done: z.boolean().default(false) });
export const visaSchema = z.object({ id: uuid, dealId: uuid, country: title, type: title, status: z.enum(["documents", "submitted", "waiting", "approved", "rejected"]), submissionOn: optionalDate, readyOn: optionalDate });
export const flightSchema = z.object({ id: uuid, dealId: uuid, route: title, airline: title, booking: z.string().max(80).default(""), departureAt: z.iso.datetime({ offset: true }), passengers: title });
export const agencyWriteSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("clients"), data: clientSchema }), z.object({ entity: z.literal("deals"), data: dealSchema }),
  z.object({ entity: z.literal("payments"), data: paymentSchema }), z.object({ entity: z.literal("checklist"), data: checklistSchema }),
  z.object({ entity: z.literal("visas"), data: visaSchema }), z.object({ entity: z.literal("flights"), data: flightSchema }),
]);
export const dealProfit = (deal: { sale: number; cost: number }) => deal.sale - deal.cost;
export const outstanding = (sale: number, payments: { amount: number; isDeleted?: boolean }[]) => Math.max(0, sale - live(payments).reduce((sum, row) => sum + row.amount, 0));
export function agencyTotals(deals: { id: string; sale: number; cost: number; currency: string; status: string; completedOn: string | null; isDeleted?: boolean }[], payments: { dealId: string; amount: number; currency: string; isDeleted?: boolean }[], period: string) {
  const result: Record<string, { profit: number; receivable: number }> = {};
  for (const deal of live(deals).filter(x => x.status !== "cancelled")) {
    const total = result[deal.currency] ??= { profit: 0, receivable: 0 };
    if (deal.status === "completed" && deal.completedOn?.startsWith(period)) total.profit += dealProfit(deal);
    total.receivable += outstanding(deal.sale, payments.filter(p => p.dealId === deal.id && p.currency === deal.currency));
  }
  return result;
}
export function agencyProfitTrend(deals: { sale: number; cost: number; currency: string; status: string; completedOn: string | null; isDeleted?: boolean }[], today: string, currency: string, days = 30) {
  const [year, month, day] = today.split("-").map(Number);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day - days + 1 + index)).toISOString().slice(0, 10);
    const amount = live(deals).filter(deal => deal.status === "completed" && deal.currency === currency && deal.completedOn === date).reduce((sum, deal) => sum + dealProfit(deal), 0);
    return { date, amount };
  });
}
export function agencyEvents(deals: { id: string; title: string; status: string; departureOn: string | null; paymentDue: string | null }[], visas: { id: string; dealId: string; country: string; status: string; submissionOn: string | null; readyOn: string | null }[], flights: { id: string; dealId: string; route: string; departureAt: string }[], today: string, reminders = false, timeZone = "Asia/Dushanbe") {
  const events: AttentionEvent[] = [];
  const active = deals.filter(d => d.status !== "cancelled" && d.status !== "completed");
  const add = (id: string, title: string, date: string | null, kind: string) => {
    if (!date) return;
    const days = dayDistance(today, date);
    if (reminders ? (kind === "departure" ? [7, 3, 1, 0].includes(days) : days <= 2) : days >= 0 && days <= 30) events.push({ id, title, date, kind, path: "/agency" });
  };
  for (const d of active) { add(d.id + "-flight", `Вылет · ${d.title}`, d.departureOn, "departure"); add(d.id + "-pay", `Оплата · ${d.title}`, d.paymentDue, "payment"); }
  for (const v of visas.filter(v => active.some(d => d.id === v.dealId) && !["approved", "rejected"].includes(v.status))) {
    if (v.status === "documents") add(v.id + "-submit", `Подача · ${v.country}`, v.submissionOn, "visa");
    add(v.id + "-ready", `Готовность визы · ${v.country}`, v.readyOn, "visa");
  }
  for (const f of flights.filter(f => active.some(d => d.id === f.dealId && !d.departureOn))) {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(f.departureAt));
    add(f.id, `Вылет · ${f.route}`, date, "departure");
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}
