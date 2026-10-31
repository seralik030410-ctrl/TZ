import { and, eq, getTableColumns, inArray, or } from "drizzle-orm";
import type { AnyMySqlTable } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { currentAccount, currentUserId } from "./accountContext";

export function privateScope(table: AnyMySqlTable) {
  return eq(getTableColumns(table).ownerId, currentUserId());
}
export function visible(table: AnyMySqlTable) {
  const columns = getTableColumns(table);
  const ids = currentAccount().workspaceIds;
  return columns.workspaceId && ids.length ? or(privateScope(table), inArray(columns.workspaceId, ids))! : privateScope(table);
}
export function owned<T extends object>(value: T): T & { ownerId: string } {
  return { ...value, ownerId: currentUserId() };
}
export function assertWorkspace(id: string | null | undefined) {
  if (id && !currentAccount().workspaceIds.includes(id)) throw new TRPCError({ code: "FORBIDDEN", message: "Общее пространство недоступно" });
}
export function ownedId(table: AnyMySqlTable, id: string) {
  return and(visible(table), eq(getTableColumns(table).id, id));
}
