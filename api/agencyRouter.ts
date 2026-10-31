import { privateScope } from "./lib/access";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "./middleware";
import { protectedQuery } from "./accountProcedure";
import { getDb } from "./queries/connection";
import { agencyWriteSchema } from "../contracts/agency";
import { clients, deals, agencyPayments, dealChecklist, visas, flights } from "../db/agency";
import { existingOwned, requireActive, writeRow } from "./moduleStore";

const tables = { clients, deals, payments: agencyPayments, checklist: dealChecklist, visas, flights };
export const agencyRouter = createRouter({
  list: protectedQuery.query(async () => {
    const db = getDb();
    const [clientsList, dealsList, paymentsList, checklist, visasList, flightsList] = await Promise.all([
      db.select().from(clients).where(and(privateScope(clients), eq(clients.isDeleted, false))), db.select().from(deals).where(and(privateScope(deals), eq(deals.isDeleted, false))),
      db.select().from(agencyPayments).where(and(privateScope(agencyPayments), eq(agencyPayments.isDeleted, false))), db.select().from(dealChecklist).where(and(privateScope(dealChecklist), eq(dealChecklist.isDeleted, false))),
      db.select().from(visas).where(and(privateScope(visas), eq(visas.isDeleted, false))), db.select().from(flights).where(and(privateScope(flights), eq(flights.isDeleted, false))),
    ]);
    const activeDeals = dealsList.filter(d => clientsList.some(c => c.id === d.clientId));
    return { clients: clientsList, deals: activeDeals, payments: paymentsList.filter(p => activeDeals.some(d => d.id === p.dealId)), checklist: checklist.filter(p => activeDeals.some(d => d.id === p.dealId)), visas: visasList.filter(p => activeDeals.some(d => d.id === p.dealId)), flights: flightsList.filter(p => activeDeals.some(d => d.id === p.dealId)) };
  }),
  save: protectedQuery.input(z.object({ record: agencyWriteSchema, mode: z.enum(["create", "update"]).default("create") })).mutation(async ({ input }) => {
    const { record, mode } = input;
    // Existing UUID returns before parent checks so replay remains idempotent.
    const table = tables[record.entity];
    const existing = await existingOwned(table, record.data.id);
    if (mode === "create" && existing) return { id: record.data.id };
    if (record.entity === "deals") {
      await requireActive(clients, record.data.clientId);
      if (record.data.returnOn && record.data.departureOn && record.data.returnOn < record.data.departureOn) throw new TRPCError({ code: "BAD_REQUEST", message: "Возвращение раньше вылета" });
      if (record.data.status === "completed" && !record.data.completedOn) throw new TRPCError({ code: "BAD_REQUEST", message: "Укажите дату завершения" });
    } else if (record.entity !== "clients") {
      const deal = await requireActive(deals, record.data.dealId);
      if (record.entity === "payments" && deal.currency !== record.data.currency) throw new TRPCError({ code: "BAD_REQUEST", message: "Валюта платежа должна совпадать с валютой сделки" });
    }
    await writeRow(table, record.data, mode);
    return { id: record.data.id };
  }),
  remove: protectedQuery.input(z.object({ entity: z.enum(["clients", "deals", "payments", "checklist", "visas", "flights"]), id: z.string().uuid() })).mutation(async ({ input }) => {
    const table = tables[input.entity];
    await getDb().update(table).set({ isDeleted: true, updatedAt: new Date() }).where(and(privateScope(table), eq(table.id, input.id)));
    return { ok: true };
  }),
});
