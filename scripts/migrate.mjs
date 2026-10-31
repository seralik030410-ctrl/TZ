import "dotenv/config";
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const connection = await mysql.createConnection(process.env.DATABASE_URL);
const directory = new URL("../db/migrations/", import.meta.url);
const journal = JSON.parse(await readFile(new URL("meta/_journal.json", directory), "utf8"));
const exists = async (query, params) => (await connection.query(query, params))[0].length > 0;
const hasColumn = (table, column) => exists("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?", [table, column]);
async function ddl(statement) {
  const dropIndex = statement.match(/^ALTER TABLE\s+`([^`]+)`\s+DROP INDEX\s+`([^`]+)`/i);
  if (dropIndex && !await exists("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?", [dropIndex[1], dropIndex[2]])) return;
  const create = statement.match(/^CREATE TABLE\s+`([^`]+)`/i);
  if (create && await exists("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", [create[1]])) return;
  const column = statement.match(/^ALTER TABLE\s+`([^`]+)`\s+ADD\s+`([^`]+)`/i);
  if (column && await hasColumn(column[1], column[2])) return;
  const foreign = statement.match(/^ALTER TABLE\s+`([^`]+)`\s+ADD CONSTRAINT\s+`([^`]+)`/i);
  if (foreign && await exists("SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?", [foreign[1], foreign[2]])) return;
  const index = statement.match(/^CREATE (?:UNIQUE )?INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`/i);
  if (index && await exists("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?", [index[2], index[1]])) return;
  await connection.query(statement);
}
try {
  const [[lock]] = await connection.query("SELECT GET_LOCK('ritm_schema_migrations', 60) AS acquired");
  if (!lock.acquired) throw new Error("Another deployment is migrating the database");
  await connection.query("CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at BIGINT)");
  for (const entry of journal.entries) {
    const source = await readFile(new URL(`${entry.tag}.sql`, directory), "utf8");
    const hash = createHash("sha256").update(source).digest("hex");
    const [applied] = await connection.query("SELECT hash FROM __drizzle_migrations WHERE created_at=?", [entry.when]);
    if (applied.length) { if (applied[0].hash !== hash) throw new Error(`Applied migration ${entry.tag} has changed`); continue; }
    const statements = source.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
    for (const statement of statements.filter(s => /^(CREATE|ALTER)/i.test(s))) await ddl(statement);
    // Older archive installations used db:push and have no migration history.
    if (entry.idx === 0) for (const [column, definition] of Object.entries({ timezone: "varchar(80) NOT NULL DEFAULT 'Asia/Dushanbe'", agency_enabled: "boolean NOT NULL DEFAULT true", gold_enabled: "boolean NOT NULL DEFAULT true", debts_enabled: "boolean NOT NULL DEFAULT true", agency_goal: "int NOT NULL DEFAULT 10000000", agency_goal_currency: "varchar(8) NOT NULL DEFAULT 'TJS'" })) {
      if (!await hasColumn("settings", column)) await connection.query(`ALTER TABLE settings ADD \`${column}\` ${definition}`);
    }
    await connection.beginTransaction();
    try {
      for (const statement of statements.filter(s => !/^(CREATE|ALTER)/i.test(s))) await connection.query(statement);
      await connection.query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", [hash, entry.when]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    console.log(`Applied ${entry.tag}`);
  }
  // Repair legacy schemas even when their migration journal already contains
  // the initial migration (older installs may have been stamped by db:push).
  for (const [column, definition] of Object.entries({ timezone: "varchar(80) NOT NULL DEFAULT 'Asia/Dushanbe'", agency_enabled: "boolean NOT NULL DEFAULT true", gold_enabled: "boolean NOT NULL DEFAULT true", debts_enabled: "boolean NOT NULL DEFAULT true", agency_goal: "int NOT NULL DEFAULT 10000000", agency_goal_currency: "varchar(8) NOT NULL DEFAULT 'TJS'" })) {
    if (!await hasColumn("settings", column)) await connection.query(`ALTER TABLE settings ADD \`${column}\` ${definition}`);
  }
  console.log("Database schema is up to date");
} finally { await connection.query("SELECT RELEASE_LOCK('ritm_schema_migrations')").catch(() => {}); await connection.end(); }
