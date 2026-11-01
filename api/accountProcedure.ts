import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicQuery } from "./middleware";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { users, workspaceMembers } from "../db/accounts";
import { readAccountSession } from "./lib/accountSecurity";
import { accountContext } from "./lib/accountContext";

export const ACCOUNT_COOKIE = "planner_session_v2";
export async function resolveAccount(req: Request) {
  const token = (req.headers.get("cookie") ?? "").split(";").map(part => part.trim()).find(part => part.startsWith(`${ACCOUNT_COOKIE}=`))?.slice(ACCOUNT_COOKIE.length + 1);
  if (!token) return null;
  const session = readAccountSession(token, env.appSecret);
  if (!session) return null;
  const [user] = await getDb().select().from(users).where(eq(users.id, session.userId));
  if (!user || user.sessionVersion !== session.version) return null;
  const members = await getDb().select().from(workspaceMembers).where(eq(workspaceMembers.userId, user.id));
  return { id: user.id, name: user.name, workspaceIds: members.map(member => member.workspaceId) };
}
export const protectedQuery = publicQuery.use(async ({ ctx, next, type, path }) => {
  const account = await resolveAccount(ctx.req);
  if (!account) throw new TRPCError({ code: "UNAUTHORIZED" });
  const expected = ctx.req.headers.get("X-Planner-Account");
  if (expected && expected !== account.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "Профиль изменился. Обновите страницу перед сохранением." });
  const taskEpoch = Number(ctx.req.headers.get("X-Planner-Task-Epoch") ?? 0);
  const checksTaskEpoch = type === "mutation" && /^(planner\.(tasks|planning)\.|daily\.|routines\.closeDay$)/.test(path);
  return accountContext.run({ ...account, taskEpoch, checksTaskEpoch }, () => next({ ctx: { ...ctx, account } }));
});
