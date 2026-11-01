import "dotenv/config";
import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const rows = JSON.parse(await readFile(new URL("./study-schedule-2026.json", import.meta.url), "utf8"));
const db = await mysql.createConnection(process.env.DATABASE_URL);
let inserted = 0;
try {
  for (const row of rows) {
    const [result] = await db.execute("INSERT IGNORE INTO schedule_items (id,owner_id,title,kind,start_min,end_min,weekdays,week_parity,on_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [row.id, "00000000-0000-4000-8000-000000000001", row.title, row.kind, row.startMin, row.endMin, row.weekdays, row.weekParity, row.onDate]);
    inserted += result.affectedRows;
  }
  console.log(`Пары Пн–Сб до 31.12.2026 и Корео Пн 09:00–10:00: новых записей ${inserted}.`);
} finally { await db.end(); }
