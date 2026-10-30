import { z } from "zod";
import { uuid, title, note, money, currencyCode, calendarDate, decimalValue, dayInZone, live } from "./shared";
export const tradeSchema = z.object({ id: uuid, date: z.iso.datetime({ offset: true }), closedAt: z.iso.datetime({ offset: true }).nullable().default(null), direction: z.enum(["buy", "sell"]).nullable().default(null), instrument: title.default("XAU/USD"), size: decimalValue.refine(v => Number(v) > 0).nullable().default(null), entry: decimalValue.nullable().default(null), exit: decimalValue.nullable().default(null), result: z.number().int().min(-2_000_000_000).max(2_000_000_000), commission: money.default(0), currency: currencyCode, reason: z.string().max(180).default(""), state: z.enum(["calm", "rush", "tilt", "not_recorded"]).default("not_recorded"), comment: note, status: z.enum(["open", "closed"]), riskPercent: decimalValue.refine(v => Number(v) <= 100).nullable().default(null) }).superRefine((trade, context) => { if (trade.status === "open") for (const key of ["direction", "size", "entry", "riskPercent"] as const) if (!trade[key]) context.addIssue({ code: "custom", path: [key], message: "Нужно указать для открытой сделки" }); });
export const transferSchema = z.object({ id: uuid, type: z.enum(["deposit", "withdrawal"]), amount: money.positive(), currency: currencyCode, date: calendarDate, note });
export const balanceSchema = z.object({ id: uuid, date: calendarDate, amount: money, currency: currencyCode });
export const rulesSchema = z.object({ id: uuid, currency: currencyCode, dailyLoss: money.positive(), dailyGoal: money, maxTrades: z.number().int().min(1).max(1000), maxRiskPercent: decimalValue.refine(v => Number(v) > 0 && Number(v) <= 100), pauseAfter: z.number().int().min(1).max(100), pauseMinutes: z.number().int().min(1).max(10080), phrase: z.string().min(4).max(100).optional() });
export const goldWriteSchema = z.discriminatedUnion("entity", [z.object({ entity: z.literal("trades"), data: tradeSchema }), z.object({ entity: z.literal("transfers"), data: transferSchema }), z.object({ entity: z.literal("balances"), data: balanceSchema }), z.object({ entity: z.literal("rules"), data: rulesSchema })]);
export type GoldTrade = { id: string; date: string; closedAt?: string | null; result: number; commission: number; status: string; currency: string; isDeleted?: boolean };
export type GoldRule = { dailyLoss: number; dailyGoal: number; maxTrades: number; maxRiskPercent: string; pauseAfter: number; pauseMinutes: number; lockUntil?: string | null; lockKey?: string | null; lockReason?: string | null };
export const netResult = (trade: GoldTrade) => trade.result - trade.commission;
export const returnRate = (invested: number, balance: number | null, withdrawn: number) => invested > 0 && balance !== null ? (balance + withdrawn - invested) / invested * 100 : null;
export const dayRate = (result: number, startingBalance: number | null) => startingBalance !== null && startingBalance > 0 ? result / startingBalance * 100 : null;
export const closeTime = (trade: GoldTrade) => trade.closedAt ?? trade.date;
const closed = (rows: GoldTrade[]) => live(rows).filter(t => t.status === "closed").sort((a, b) => closeTime(a).localeCompare(closeTime(b)) || a.id.localeCompare(b.id));
export function lossStreak(rows: GoldTrade[]) {
  let count = 0;
  for (const trade of closed(rows).reverse()) { if (netResult(trade) >= 0) break; count++; }
  return count;
}
export function goldStats(rows: GoldTrade[], timeZone = "Asia/Dushanbe") {
  const trades = closed(rows); const wins = trades.filter(t => netResult(t) > 0); const losses = trades.filter(t => netResult(t) < 0);
  const days: Record<string, number> = {};
  for (const t of trades) { const day = dayInZone(new Date(closeTime(t)), timeZone); days[day] = (days[day] ?? 0) + netResult(t); }
  const ranked = Object.entries(days).sort((a, b) => b[1] - a[1]);
  return { net: trades.reduce((s, t) => s + netResult(t), 0), winRate: trades.length ? wins.length / trades.length * 100 : null, averageWin: wins.length ? wins.reduce((s, t) => s + netResult(t), 0) / wins.length : 0, averageLoss: losses.length ? losses.reduce((s, t) => s + netResult(t), 0) / losses.length : 0, streak: lossStreak(trades), best: ranked[0] ?? null, worst: ranked.at(-1) ?? null };
}
function endOfLocalDay(now: Date, timeZone: string) {
  const today = dayInZone(now, timeZone); let low = now.getTime(); let high = low + 27 * 3_600_000;
  while (high - low > 1000) { const middle = Math.floor((low + high) / 2); if (dayInZone(new Date(middle), timeZone) === today) low = middle; else high = middle; }
  return new Date(high).toISOString();
}
export function goldStop(rows: GoldTrade[], rule: GoldRule, now = new Date(), timeZone = "Asia/Dushanbe") {
  const today = dayInZone(now, timeZone);
  const all = live(rows).filter(t => Date.parse(t.date) <= now.getTime());
  const dayTrades = all.filter(t => dayInZone(new Date(t.date), timeZone) === today);
  const net = goldStats(all.filter(t => t.status === "closed" && dayInZone(new Date(closeTime(t)), timeZone) === today)).net;
  let reason = ""; let until: string | null = null;
  if (-net >= rule.dailyLoss) { reason = "Дневной лимит убытка"; until = endOfLocalDay(now, timeZone); }
  else if (dayTrades.length >= rule.maxTrades) { reason = "Максимум сделок на сегодня"; until = endOfLocalDay(now, timeZone); }
  else if (lossStreak(all) >= rule.pauseAfter) {
    const last = closed(all).at(-1);
    if (last) { const pauseEnd = Date.parse(closeTime(last)) + rule.pauseMinutes * 60_000; if (pauseEnd > now.getTime()) { reason = "Пауза после серии убытков"; until = new Date(pauseEnd).toISOString(); } }
  }
  let key = reason ? `${today}:${reason}:${all.map(t => `${t.id}/${t.status}/${t.result}/${t.commission}`).sort().join(",")}` : "";
  if (rule.lockUntil && Date.parse(rule.lockUntil) > now.getTime()) { reason = rule.lockReason || reason || "Действует стоп"; until = rule.lockUntil; key = rule.lockKey || key; }
  return { blocked: Boolean(reason), reason, until, key, remainingLoss: Math.max(0, rule.dailyLoss + Math.min(0, net)), remainingTrades: Math.max(0, rule.maxTrades - dayTrades.length), net };
}
