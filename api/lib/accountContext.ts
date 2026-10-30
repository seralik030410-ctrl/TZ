import { AsyncLocalStorage } from "node:async_hooks";
import { TRPCError } from "@trpc/server";
import { OWNER_ID } from "../../db/accounts";

export type AccountIdentity = { id: string; name: string; workspaceIds: string[] };
export const accountContext = new AsyncLocalStorage<AccountIdentity>();
export function currentAccount(): AccountIdentity {
  const account = accountContext.getStore();
  if (!account) throw new TRPCError({ code: "UNAUTHORIZED" });
  return account;
}
export const currentUserId = () => currentAccount().id;
export const currentSettingsId = () => currentUserId() === OWNER_ID ? "default" : currentUserId();
