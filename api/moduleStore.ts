import { and, eq, sql, getTableColumns } from "drizzle-orm";
import type { AnyMySqlTable } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { getDb } from "./queries/connection";

// Inserts are a no-op on duplicate UUID, including tombstones. Retrying a
// response lost on the network must never reapply stale values or resurrect rows.
export async function createOnce(table: AnyMySqlTable, value: Record<string, unknown>) {
  await getDb().insert(table).values(value).onDuplicateKeyUpdate({ set: { id: sql`id` } });
}
export async function requireActive(table: AnyMySqlTable, id: string) {
  const columns = getTableColumns(table);
  const [row] = await getDb().select().from(table).where(and(eq(columns.id, id), eq(columns.isDeleted, false))).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Связанная запись не найдена или удалена" });
  return row;
}
export async function writeRow(table: AnyMySqlTable, value: Record<string, unknown> & { id: string }, mode: "create" | "update") {
  if (mode === "create") return createOnce(table, value);
  await requireActive(table, value.id);
  const columns = getTableColumns(table);
  await getDb().update(table).set({ ...value, updatedAt: new Date() }).where(and(eq(columns.id, value.id), eq(columns.isDeleted, false)));
}
