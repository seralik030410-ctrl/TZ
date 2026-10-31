import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicQuery, createRouter } from "./middleware";
import { protectedQuery, resolveAccount, ACCOUNT_COOKIE } from "./accountProcedure";
import { acceptInvitation, authenticateAccount, inviteFriend } from "./queries/accounts";
import { getDb } from "./queries/connection";
import { users, workspaces } from "../db/accounts";
import { env } from "./lib/env";
import { hashPassword, signAccountSession, verifyPassword } from "./lib/accountSecurity";

const attempts = new Map<string, { count: number; reset: number }>();
function rateLimit(req: Request) {
  const key = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const now = Date.now();
  const state = attempts.get(key);
  if (state && state.reset > now && state.count >= 8) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Подождите минуту перед следующей попыткой." });
  if (attempts.size > 10000) for (const [ip, row] of attempts) if (row.reset <= now) attempts.delete(ip);
  attempts.set(key, { count: state && state.reset > now ? state.count + 1 : 1, reset: state && state.reset > now ? state.reset : now + 60000 });
}
function session(headers: Headers, user: { id: string; sessionVersion: number }) {
  const age = 30 * 86400;
  const token = signAccountSession({ userId: user.id, version: user.sessionVersion, expiresAt: Date.now() + age * 1000 }, env.appSecret);
  headers.append("Set-Cookie", `${ACCOUNT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${env.isProduction ? "; Secure" : ""}`);
}
const password = z.string().min(8, "Не менее 8 символов").max(200);
export const authRouter = createRouter({
  status: publicQuery.query(async ({ ctx }) => {
    const account = await resolveAccount(ctx.req);
    const spaces = account?.workspaceIds.length ? await getDb().select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(inArray(workspaces.id, account.workspaceIds)) : [];
    return { authenticated: !!account, user: account ? { id: account.id, name: account.name } : null, workspaces: spaces };
  }),
  login: publicQuery.input(z.object({ password: z.string().min(1).max(200) })).mutation(async ({ ctx, input }) => {
    rateLimit(ctx.req);
    const user = await authenticateAccount(input.password);
    session(ctx.resHeaders, user);
    return { ok: true };
  }),
  register: publicQuery.input(z.object({ token: z.string().min(40).max(100), name: z.string().trim().min(1).max(80), password })).mutation(async ({ ctx, input }) => {
    rateLimit(ctx.req);
    const user = await acceptInvitation(input.token, input.name, input.password);
    session(ctx.resHeaders, user);
    return { ok: true };
  }),
  invite: protectedQuery.mutation(({ ctx }) => inviteFriend(ctx.account.id)),
  logout: publicQuery.mutation(async ({ ctx }) => {
    const account = await resolveAccount(ctx.req);
    if (account) await getDb().update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, account.id));
    ctx.resHeaders.append("Set-Cookie", `${ACCOUNT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.isProduction ? "; Secure" : ""}`);
    return { ok: true };
  }),
  changePassword: protectedQuery.input(z.object({ oldPassword: z.string().min(1).max(200), password })).mutation(async ({ ctx, input }) => {
    rateLimit(ctx.req);
    await getDb().transaction(async tx => {
      // Same lock as registration makes password-only identities unambiguous.
      const all = await tx.select().from(users).for("update");
      const user = all.find(row => row.id === ctx.account.id)!;
      if (!verifyPassword(input.oldPassword, user.passwordHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный текущий пароль" });
      if (all.some(row => row.id !== user.id && verifyPassword(input.password, row.passwordHash))) throw new TRPCError({ code: "BAD_REQUEST", message: "Выберите другой пароль" });
      const version = user.sessionVersion + 1;
      await tx.update(users).set({ passwordHash: hashPassword(input.password), sessionVersion: version }).where(eq(users.id, user.id));
      session(ctx.resHeaders, { id: user.id, sessionVersion: version });
    });
    return { ok: true };
  }),
});
