import { mysqlTable, varchar, int, timestamp } from "drizzle-orm/mysql-core";

export const OWNER_ID = "00000000-0000-4000-8000-000000000001";
export const users = mysqlTable("planner_users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  passwordHash: varchar("password_hash", { length: 240 }).notNull(),
  sessionVersion: int("session_version").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const workspaces = mysqlTable("workspaces", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  ownerId: varchar("owner_id", { length: 36 }).notNull(),
});
export const workspaceMembers = mysqlTable("workspace_members", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
});
export const invitations = mysqlTable("planner_invitations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  workspaceId: varchar("workspace_id", { length: 36 }).notNull(),
  createdBy: varchar("created_by", { length: 36 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});
