import "dotenv/config";
import mysql from "mysql2/promise";
import { createHash } from "node:crypto";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = await mysql.createConnection(process.env.DATABASE_URL);
const periods = [["2026-10-26", "2026-11-07"], ["2026-11-09", "2026-11-21"], ["2026-11-23", "2026-12-05"], ["2026-12-07", "2026-12-19"]];
const times = [[480, 710], [780, 1010]];
const idFor = (date, start) => createHash("sha256").update(`ritm-508:${date}:${start}`).digest("hex").slice(0, 32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
let inserted = 0;
  for (const [from, to] of periods) {
    for (let day = new Date(`${from}T12:00:00Z`); day <= new Date(`${to}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0, 10);
      for (const [startMin, endMin] of times) {
        const id = idFor(date, startMin);
        const [result] = await db.execute("INSERT IGNORE INTO schedule_items (id,title,kind,start_min,end_min,weekdays,week_parity,on_date,location,is_deleted,created_at,updated_at) VALUES (?, 'Пара', 'class', ?, ?, '1,2,3,4,5,6,7', 'all', ?, NULL, 0, ?, ?)", [id, startMin, endMin, date, Date.now(), Date.now()]);
        inserted += result.affectedRows;
      }
    }
  }
   console.log(`Расписание группы 508 добавлено. Новых событий: ${inserted}; повторный запуск безопасен.`);
const mondayTemplate = '50800000-0000-4000-8000-000000000001';
await db.execute("INSERT IGNORE INTO task_templates (id,title,estimate_min,weekdays,starts_on,ends_on,paused,subtask_titles,is_deleted,created_at,updated_at) VALUES (?, 'Записать 5 человек', 30, '1', '2026-10-26', NULL, 0, ?, 0, ?, ?)", [mondayTemplate, JSON.stringify(['Имя 1','Имя 2','Имя 3','Имя 4','Имя 5']), Date.now(), Date.now()]);
const mondayEvent = '50800000-0000-4000-8000-000000000002';
await db.execute("INSERT IGNORE INTO schedule_items (id,title,kind,start_min,end_min,weekdays,week_parity,on_date,location,is_deleted,created_at,updated_at) VALUES (?, 'Записать 5 человек', 'work', 540, 570, '1', 'all', NULL, NULL, 0, ?, ?)", [mondayEvent, Date.now(), Date.now()]);
await db.end();



