import { writeFileSync, readFileSync } from 'node:fs';
const owner = "'00000000-0000-4000-8000-000000000001'";
const batch = "'study-only-2026-11-01'";
const filters = {
  projects: "workspace_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks shared WHERE shared.project_id=r.id AND shared.workspace_id IS NOT NULL)",
  stages: "workspace_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks shared WHERE shared.stage_id=r.id AND shared.workspace_id IS NOT NULL)",
  tasks: "workspace_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks shared WHERE shared.workspace_id IS NOT NULL AND (shared.parent_id=r.id OR shared.depends_on=r.id))",
  scheduled_blocks: "workspace_id IS NULL",
  schedule_items: "kind <> 'class' AND title <> 'Запись в Корео'",
  schedule_exceptions: "EXISTS (SELECT 1 FROM schedule_items s WHERE s.id=r.item_id AND s.kind <> 'class' AND s.title <> 'Запись в Корео')",
};
const tables = ['scheduled_blocks','tasks','stages','projects','schedule_exceptions','schedule_items','time_logs','transactions','recurring_bills','journal_entries','task_templates','reflow_log','payments','deal_checklist','visas','flights','deals','clients','debt_payments','debts','gold_trades','gold_transfers','gold_balance','gold_rules','gold_overrides'];
const statements = ["CREATE TABLE `personal_cleanup_archive` (`batch` varchar(80) NOT NULL, `table_name` varchar(80) NOT NULL, `record_id` varchar(36) NOT NULL, `owner_id` varchar(36) NOT NULL, `archived_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `restored_at` timestamp NULL, PRIMARY KEY (`batch`,`table_name`,`record_id`))"];
for (const table of tables) {
  const filter = filters[table] ?? '1=1';
  statements.push(`INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT ${batch},'${table}',r.id,r.owner_id FROM ${table} r WHERE r.owner_id=${owner} AND r.is_deleted=0 AND (${filter})`);
}
for (const table of tables) statements.push(`UPDATE ${table} r JOIN personal_cleanup_archive a ON a.record_id=r.id AND a.owner_id=r.owner_id AND a.table_name='${table}' AND a.batch=${batch} SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL`);
statements.push(`UPDATE settings SET task_epoch=task_epoch+1,updated_at=CURRENT_TIMESTAMP WHERE owner_id=${owner}`);
writeFileSync('db/migrations/0016_study_only_archive.sql', statements.join(';\n--> statement-breakpoint\n')+';\n');
const path='db/migrations/meta/_journal.json';
const journal=JSON.parse(readFileSync(path,'utf8'));
if (!journal.entries.some(e=>e.idx===16)) journal.entries.push({idx:16,version:'5',when:1793500000008,tag:'0016_study_only_archive',breakpoints:true});
writeFileSync(path,JSON.stringify(journal,null,2)+'\n');
