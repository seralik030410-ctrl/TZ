import { randomUUID, randomBytes, createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./connection";
import { users, workspaces, workspaceMembers, invitations, OWNER_ID } from "../../db/accounts";
import { hashPassword, verifyPassword } from "../lib/accountSecurity";
import { env } from "../lib/env";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function ensureOwnerAccount() {
  const db = getDb();
  const [owner] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  if (owner) return;
  if (!env.plannerPassword) throw new Error("PLANNER_PASSWORD is required to initialize the owner account");
  await db.transaction(async tx => {
    await tx.insert(users).values({ id: OWNER_ID, name: "Алекс", passwordHash: hashPassword(env.plannerPassword) }).onDuplicateKeyUpdate({ set: { id: OWNER_ID } });
    await tx.insert(workspaces).values({ id: WORKSPACE_ID, name: "Общие дела", ownerId: OWNER_ID }).onDuplicateKeyUpdate({ set: { id: WORKSPACE_ID } });
    await tx.insert(workspaceMembers).values({ id: OWNER_ID, workspaceId: WORKSPACE_ID, userId: OWNER_ID }).onDuplicateKeyUpdate({ set: { id: OWNER_ID } });
  });
}

export async function authenticateAccount(password: string) {
  await ensureOwnerAccount();
  const accounts = await getDb().select().from(users);
  const matches = accounts.filter(user => verifyPassword(password, user.passwordHash));
  if (matches.length !== 1) throw new TRPCError({ code: "UNAUTHORIZED", message: "Неверный пароль" });
  return matches[0];
}

export async function inviteFriend(userId: string) {
  const db = getDb();
  const [space] = await db.select().from(workspaces).where(eq(workspaces.ownerId, userId));
  if (!space) throw new TRPCError({ code: "FORBIDDEN" });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(invitations).values({ id: randomUUID(), tokenHash: digest(token), workspaceId: space.id, createdBy: userId, expiresAt });
  return { token, expiresAt };
}

export async function acceptInvitation(token: string, name: string, password: string) {
  const db = getDb();
  return db.transaction(async tx => {
    // The owner row serializes registrations, including different invite tokens.
    await tx.select().from(users).where(eq(users.id, OWNER_ID)).for("update");
    const [invite] = await tx.select().from(invitations).where(and(eq(invitations.tokenHash, digest(token)), isNull(invitations.usedAt))).for("update");
    if (!invite || invite.expiresAt.getTime() <= Date.now()) throw new TRPCError({ code: "BAD_REQUEST", message: "Приглашение недействительно или истекло" });
    const members = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, invite.workspaceId));
    if (members.length >= 2) throw new TRPCError({ code: "CONFLICT", message: "Друг уже присоединился" });
    const accounts = await tx.select().from(users);
    if (accounts.some(user => verifyPassword(password, user.passwordHash))) throw new TRPCError({ code: "BAD_REQUEST", message: "Выберите другой пароль" });
    const id = randomUUID();
    await tx.insert(users).values({ id, name, passwordHash: hashPassword(password) });
    await tx.insert(workspaceMembers).values({ id: randomUUID(), workspaceId: invite.workspaceId, userId: id });
    await tx.update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, invite.id));
    return { id, name, sessionVersion: 0 };
  });
}
