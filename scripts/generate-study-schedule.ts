import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { studySchedule, STUDY_OWNER } from "../contracts/studySchedule";
const rows = studySchedule().map(row => {
  const h = createHash("sha256").update(`ritm-study-2026:${row.onDate}:${row.startMin}:${row.kind}`).digest("hex");
  return { ...row, id: `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}` };
});
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
const excluded = rows.map(r => quote(r.id)).join(",");
const sql = `-- Canonical personal timetable, 01 Nov–31 Dec 2026. No shared/friend rows.\nUPDATE schedule_items SET is_deleted=1, updated_at=CURRENT_TIMESTAMP WHERE owner_id=${quote(STUDY_OWNER)} AND kind='class' AND (on_date IS NULL OR on_date BETWEEN '2026-11-01' AND '2026-12-31') AND id NOT IN (${excluded});\n--> statement-breakpoint\nUPDATE schedule_items SET is_deleted=1, updated_at=CURRENT_TIMESTAMP WHERE owner_id=${quote(STUDY_OWNER)} AND id='50800000-0000-4000-8000-000000000002';\n--> statement-breakpoint\nUPDATE task_templates SET is_deleted=1, updated_at=CURRENT_TIMESTAMP WHERE owner_id=${quote(STUDY_OWNER)} AND id='50800000-0000-4000-8000-000000000001';\n--> statement-breakpoint\nINSERT IGNORE INTO schedule_items (id,owner_id,title,kind,start_min,end_min,weekdays,week_parity,on_date) VALUES\n${rows.map(r=>`(${[r.id,STUDY_OWNER,r.title,r.kind].map(quote).join(",")},${r.startMin},${r.endMin},${quote(r.weekdays)},'all',${quote(r.onDate)})`).join(",\n")};\n`;
const relink = `--> statement-breakpoint
UPDATE tasks t
JOIN schedule_items old ON old.id=t.schedule_item_id AND old.owner_id=t.owner_id
LEFT JOIN schedule_items replacement ON replacement.owner_id=old.owner_id AND replacement.kind='class' AND replacement.on_date=COALESCE(old.on_date,t.due) AND replacement.start_min=old.start_min AND replacement.id IN (${excluded})
SET t.schedule_item_id=replacement.id, t.due=COALESCE(t.due,old.on_date), t.updated_at=CURRENT_TIMESTAMP
WHERE t.owner_id=${quote(STUDY_OWNER)} AND t.workspace_id IS NULL AND old.kind='class' AND old.id NOT IN (${excluded}) AND (old.on_date IS NULL OR old.on_date BETWEEN '2026-11-01' AND '2026-12-31');
--> statement-breakpoint
UPDATE schedule_exceptions e
JOIN schedule_items old ON old.id=e.item_id AND old.owner_id=e.owner_id
JOIN schedule_items replacement ON replacement.owner_id=old.owner_id AND replacement.kind='class' AND replacement.on_date=e.date AND replacement.start_min=old.start_min AND replacement.id IN (${excluded})
SET e.item_id=replacement.id, e.updated_at=CURRENT_TIMESTAMP
WHERE e.owner_id=${quote(STUDY_OWNER)} AND old.kind='class' AND old.id NOT IN (${excluded});
`;
writeFileSync("db/migrations/0015_study_schedule_nov_dec.sql", sql + relink);
writeFileSync("scripts/study-schedule-2026.json", JSON.stringify(rows,null,2)+"\n");
