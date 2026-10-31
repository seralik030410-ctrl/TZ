import { privateScope } from "./lib/access";
import { currentUserId, currentSettingsId } from "./lib/accountContext";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { protectedQuery } from "./accountProcedure";
import { getDb } from "./queries/connection";
import { goldTrades, goldTransfers, goldBalances, goldRules, goldOverrides } from "../db/gold";
import { settings } from "../db/schema";
import { goldStop, goldWriteSchema } from "../contracts/gold";
import { currencyCode, dayInZone } from "../contracts/shared";
import { existingOwned, createOnce, writeRow } from "./moduleStore";

const tables = { trades: goldTrades, transfers: goldTransfers, balances: goldBalances, rules: goldRules };
const hashPhrase = (phrase: string) => { const salt = randomBytes(16).toString("hex"); return salt + ":" + scryptSync(phrase, salt, 32).toString("hex"); };
const verifyPhrase = (phrase: string, hash: string) => { const [salt, digest] = hash.split(":"); return Boolean(salt && digest) && timingSafeEqual(scryptSync(phrase, salt, 32), Buffer.from(digest, "hex")); };
const overrideAttempts = new Map<string, { count: number; expires: number }>();
export const goldRouter = createRouter({
  list: protectedQuery.query(async () => {
    const db = getDb();
    const [trades, transfers, balances, ruleRows, overrides] = await Promise.all([db.select().from(goldTrades).where(and(privateScope(goldTrades), eq(goldTrades.isDeleted, false))), db.select().from(goldTransfers).where(and(privateScope(goldTransfers), eq(goldTransfers.isDeleted, false))), db.select().from(goldBalances).where(and(privateScope(goldBalances), eq(goldBalances.isDeleted, false))), db.select().from(goldRules).where(and(privateScope(goldRules), eq(goldRules.isDeleted, false))), db.select().from(goldOverrides).where(and(privateScope(goldOverrides), eq(goldOverrides.isDeleted, false)))]);
    const rules = ruleRows.map(({ phraseHash, ...safeRow }) => { void phraseHash; return safeRow; });
    return { trades, transfers, balances, rules, overrides };
  }),
  save: protectedQuery.input(z.object({ record: goldWriteSchema, mode: z.enum(["create", "update"]).default("create") })).mutation(async ({ input }) => {
    const { record, mode } = input; const db = getDb(); const table = tables[record.entity];
    const existing = await existingOwned(table, record.data.id);
    if (mode === "create" && existing) return { id: record.data.id };
    if (record.entity === "rules") {
      const { phrase, ...row } = record.data;
      const [previous] = await db.select().from(goldRules).where(and(privateScope(goldRules), eq(goldRules.currency, row.currency)));
      if (previous && previous.id !== row.id) throw new TRPCError({ code: "CONFLICT", message: "Правила для этой валюты уже существуют. Откройте их для изменения." });
      if (!previous && !phrase) throw new TRPCError({ code: "BAD_REQUEST", message: "Задайте кодовую фразу" });
      if (previous) {
        const [prefs] = await db.select().from(settings).where(and(privateScope(settings), eq(settings.id, currentSettingsId()))).limit(1);
        const trades = await db.select().from(goldTrades).where(and(privateScope(goldTrades), eq(goldTrades.currency, row.currency)));
        if (goldStop(trades, previous, new Date(), prefs?.timezone).blocked) throw new TRPCError({ code: "FORBIDDEN", message: "Во время стопа правила менять нельзя" });
      }
      await writeRow(goldRules, { ...row, ...(phrase ? { phraseHash: hashPhrase(phrase) } : {}) }, mode);
    } else if (record.entity === "trades") {
      // A row lock makes the count/stop check and insert serial for this currency.
      await db.transaction(async tx => {
        const tradeData = { ...record.data, closedAt: record.data.status === "closed" ? record.data.closedAt ?? (mode === "create" ? record.data.date : new Date().toISOString()) : null };
        if (tradeData.closedAt && (Date.parse(tradeData.closedAt) < Date.parse(tradeData.date) || Date.parse(tradeData.closedAt) > Date.now() + 60_000)) throw new TRPCError({ code: "BAD_REQUEST", message: "Проверьте время закрытия сделки" });
        const [rule] = await tx.select().from(goldRules).where(and(privateScope(goldRules), and(eq(goldRules.currency, record.data.currency), eq(goldRules.isDeleted, false)))).for("update");
        if (!rule) throw new TRPCError({ code: "BAD_REQUEST", message: "Сначала настройте лимиты для этой валюты" });
        const [prefs] = await tx.select().from(settings).where(and(privateScope(settings), eq(settings.id, currentSettingsId()))).limit(1);
        const timezone = prefs?.timezone ?? "Asia/Dushanbe";
        if (Date.parse(record.data.date) > Date.now() + 60_000) throw new TRPCError({ code: "BAD_REQUEST", message: "Сделка не может быть в будущем" });
        if (record.data.riskPercent && Number(record.data.riskPercent) > Number(rule.maxRiskPercent)) throw new TRPCError({ code: "BAD_REQUEST", message: "Риск превышает лимит на сделку" });
        const rows = await tx.select().from(goldTrades).where(and(privateScope(goldTrades), eq(goldTrades.currency, record.data.currency)));
        const capture = async (list: typeof rows) => {
          const stop = goldStop(list, { ...rule, lockUntil: null }, new Date(), timezone);
          if (stop.blocked && stop.until) await tx.update(goldRules).set({ lockUntil: stop.until, lockReason: stop.reason, lockKey: stop.key, updatedAt: new Date() }).where(and(privateScope(goldRules), eq(goldRules.id, rule.id)));
        };
        if (mode === "create") {
          if (rows.some(t => t.id === record.data.id)) return;
          const now = new Date(); const stop = goldStop(rows, rule, now, timezone);
          const overrides = await tx.select().from(goldOverrides).where(and(privateScope(goldOverrides), eq(goldOverrides.currency, record.data.currency)));
          if (stop.blocked && !overrides.some(o => o.stateKey === stop.key && Date.parse(o.until) > now.getTime())) throw new TRPCError({ code: "FORBIDDEN", message: `Стоп: ${stop.reason}. Снимите блокировку кодовой фразой.` });
          // Backdating cannot evade today's stop or retroactively breach a past day's limits.
          const historical = goldStop(rows.filter(t => t.date <= record.data.date), rule, new Date(record.data.date), timezone);
          if (dayInZone(new Date(record.data.date), timezone) !== dayInZone(now, timezone) && historical.blocked) throw new TRPCError({ code: "FORBIDDEN", message: "На выбранную дату уже достигнут лимит" });
          await createOnce(goldTrades, tradeData, tx);
          await capture(await tx.select().from(goldTrades).where(and(privateScope(goldTrades), eq(goldTrades.currency, record.data.currency))));
        } else {
          const original = rows.find(t => t.id === record.data.id && !t.isDeleted);
          if (!original || original.currency !== record.data.currency || original.date !== record.data.date) throw new TRPCError({ code: "BAD_REQUEST", message: "Дата и валюта существующей сделки не меняются" });
          if (original.status === "closed" && record.data.status === "closed" && !record.data.closedAt) tradeData.closedAt = original.closedAt ?? original.date;
          await capture(rows);
          await tx.update(goldTrades).set({ ...tradeData, updatedAt: new Date() }).where(and(privateScope(goldTrades), eq(goldTrades.id, record.data.id)));
          await capture(await tx.select().from(goldTrades).where(and(privateScope(goldTrades), eq(goldTrades.currency, record.data.currency))));
        }
      });
    } else await writeRow(table, record.data, mode);
    return { id: record.data.id };
  }),
  override: protectedQuery.input(z.object({ id: z.string().uuid(), currency: currencyCode, phrase: z.string().min(1).max(100), reason: z.string().trim().min(5).max(1000) })).mutation(async ({ input }) => {
    const db = getDb(); const now = new Date();
    const attemptKey = `${currentUserId()}:${input.currency}`;
    const attempt = overrideAttempts.get(attemptKey);
    if (attempt && attempt.expires > now.getTime() && attempt.count >= 5) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Подождите минуту перед следующей попыткой" });
    const [rule] = await db.select().from(goldRules).where(and(privateScope(goldRules), eq(goldRules.currency, input.currency)));
    if (!rule || !verifyPhrase(input.phrase, rule.phraseHash)) { overrideAttempts.set(attemptKey, { count: (attempt && attempt.expires > now.getTime() ? attempt.count : 0) + 1, expires: now.getTime() + 60_000 }); throw new TRPCError({ code: "FORBIDDEN", message: "Неверная кодовая фраза" }); }
    const [prefs] = await db.select().from(settings).where(and(privateScope(settings), eq(settings.id, currentSettingsId()))).limit(1);
    const rows = await db.select().from(goldTrades).where(and(privateScope(goldTrades), eq(goldTrades.currency, input.currency)));
    const stop = goldStop(rows, rule, now, prefs?.timezone);
    if (!stop.blocked || !stop.until) throw new TRPCError({ code: "BAD_REQUEST", message: "Блокировка уже не активна" });
    await createOnce(goldOverrides, { id: input.id, currency: input.currency, date: now.toISOString(), reason: input.reason, stateKey: stop.key, until: stop.until });
    overrideAttempts.delete(attemptKey); return { ok: true };
  }),
  remove: protectedQuery.input(z.object({ entity: z.enum(["trades", "transfers", "balances"]), id: z.string().uuid() })).mutation(async ({ input }) => {
    const table = tables[input.entity];
    await getDb().transaction(async tx => {
      if (input.entity === "trades") {
        const [trade] = await tx.select().from(goldTrades).where(and(privateScope(goldTrades), eq(goldTrades.id, input.id)));
        if (!trade) return;
        const [rule] = await tx.select().from(goldRules).where(and(privateScope(goldRules), eq(goldRules.currency, trade.currency))).for("update");
        const [prefs] = await tx.select().from(settings).where(and(privateScope(settings), eq(settings.id, currentSettingsId()))).limit(1);
        if (rule) {
          const rows = await tx.select().from(goldTrades).where(and(privateScope(goldTrades), eq(goldTrades.currency, trade.currency)));
          const stop = goldStop(rows, rule, new Date(), prefs?.timezone);
          if (stop.blocked && stop.until) await tx.update(goldRules).set({ lockUntil: stop.until, lockReason: stop.reason, lockKey: stop.key }).where(and(privateScope(goldRules), eq(goldRules.id, rule.id)));
        }
      }
      await tx.update(table).set({ isDeleted: true, updatedAt: new Date() }).where(and(privateScope(table), eq(table.id, input.id)));
    }); return { ok: true };
  }),
});
