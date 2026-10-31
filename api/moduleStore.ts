import { and, eq, sql, getTableColumns } from "drizzle-orm";
import type { AnyMySqlTable } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { getDb } from "./queries/connection";
import { privateScope, owned } from "./lib/access";
import { currentUserId } from "./lib/accountContext";

type DB = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

// UUID retries may refer only to the caller's own records, including tombstones.
export async function existingOwned(table: AnyMySqlTable, id: string, db: DB | Tx = getDb()) {
  const columns = getTableColumns(table);
  const [row] = await db.select().from(table).where(eq(columns.id, id)).limit(1).for("update");
  if (row && row.ownerId !== currentUserId()) throw new TRPCError({ code: "CONFLICT", message: "Идентификатор записи уже занят" });
  return row as (Record<string, unknown> & { id: string; ownerId: string }) | undefined;
}

// Inserts are a no-op on duplicate UUID, including tombstones. Retrying a
// response lost on the network must never reapply stale values or resurrect rows.
export async function createOnce(table: AnyMySqlTable, value: Record<string, unknown>, db: DB | Tx = getDb()) {
  if (await existingOwned(table, String(value.id), db)) return;
  await db.insert(table).values(owned(value)).onDuplicateKeyUpdate({ set: { id: sql`id` } });
  if (!await existingOwned(table, String(value.id), db)) throw new TRPCError({ code: "CONFLICT", message: "Запись с такими данными уже существует" });
}
export async function requireActive(table: AnyMySqlTable, id: string) {
  const columns = getTableColumns(table);
  const [row] = await getDb().select().from(table).where(and(privateScope(table), eq(columns.id, id), eq(columns.isDeleted, false))).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Связанная запись не найдена или удалена" });
  return row;
}
export async function writeRow(table: AnyMySqlTable, value: Record<string, unknown> & { id: string }, mode: "create" | "update") {
  if (mode === "create") return createOnce(table, value);
  await requireActive(table, value.id);
  const columns = getTableColumns(table);
  await getDb().update(table).set({ ...value, updatedAt: new Date() }).where(and(privateScope(table), eq(columns.id, value.id), eq(columns.isDeleted, false)));
}
