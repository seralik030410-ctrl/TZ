CREATE TABLE `personal_cleanup_archive` (`batch` varchar(80) NOT NULL, `table_name` varchar(80) NOT NULL, `record_id` varchar(36) NOT NULL, `owner_id` varchar(36) NOT NULL, `archived_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `restored_at` timestamp NULL, PRIMARY KEY (`batch`,`table_name`,`record_id`));
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','scheduled_blocks',r.id,r.owner_id FROM scheduled_blocks r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (workspace_id IS NULL);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','tasks',r.id,r.owner_id FROM tasks r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (workspace_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks shared WHERE shared.workspace_id IS NOT NULL AND (shared.parent_id=r.id OR shared.depends_on=r.id)));
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','stages',r.id,r.owner_id FROM stages r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (workspace_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks shared WHERE shared.stage_id=r.id AND shared.workspace_id IS NOT NULL));
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','projects',r.id,r.owner_id FROM projects r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (workspace_id IS NULL AND NOT EXISTS (SELECT 1 FROM tasks shared WHERE shared.project_id=r.id AND shared.workspace_id IS NOT NULL));
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','schedule_exceptions',r.id,r.owner_id FROM schedule_exceptions r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (EXISTS (SELECT 1 FROM schedule_items s WHERE s.id=r.item_id AND s.kind <> 'class' AND s.title <> 'Запись в Корео'));
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','schedule_items',r.id,r.owner_id FROM schedule_items r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (kind <> 'class' AND title <> 'Запись в Корео');
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','time_logs',r.id,r.owner_id FROM time_logs r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','transactions',r.id,r.owner_id FROM transactions r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','recurring_bills',r.id,r.owner_id FROM recurring_bills r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','journal_entries',r.id,r.owner_id FROM journal_entries r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','task_templates',r.id,r.owner_id FROM task_templates r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','reflow_log',r.id,r.owner_id FROM reflow_log r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','payments',r.id,r.owner_id FROM payments r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','deal_checklist',r.id,r.owner_id FROM deal_checklist r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','visas',r.id,r.owner_id FROM visas r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','flights',r.id,r.owner_id FROM flights r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','deals',r.id,r.owner_id FROM deals r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','clients',r.id,r.owner_id FROM clients r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','debt_payments',r.id,r.owner_id FROM debt_payments r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','debts',r.id,r.owner_id FROM debts r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','gold_trades',r.id,r.owner_id FROM gold_trades r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','gold_transfers',r.id,r.owner_id FROM gold_transfers r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','gold_balance',r.id,r.owner_id FROM gold_balance r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','gold_rules',r.id,r.owner_id FROM gold_rules r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
INSERT IGNORE INTO personal_cleanup_archive(batch,table_name,record_id,owner_id) SELECT 'study-only-2026-11-01','gold_overrides',r.id,r.owner_id FROM gold_overrides r WHERE r.owner_id='00000000-0000-4000-8000-000000000001' AND r.is_deleted=0 AND (1=1);
--> statement-breakpoint
UPDATE scheduled_blocks r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='scheduled_blocks' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE tasks r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='tasks' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE stages r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='stages' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE projects r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='projects' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE schedule_exceptions r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='schedule_exceptions' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE schedule_items r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='schedule_items' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE time_logs r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='time_logs' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE transactions r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='transactions' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE recurring_bills r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='recurring_bills' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE journal_entries r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='journal_entries' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE task_templates r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='task_templates' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE reflow_log r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='reflow_log' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE payments r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='payments' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE deal_checklist r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='deal_checklist' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE visas r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='visas' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE flights r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='flights' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE deals r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='deals' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE clients r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='clients' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE debt_payments r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='debt_payments' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE debts r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='debts' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE gold_trades r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='gold_trades' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE gold_transfers r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='gold_transfers' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE gold_balance r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='gold_balance' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE gold_rules r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='gold_rules' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE gold_overrides r JOIN personal_cleanup_archive a ON BINARY a.record_id=BINARY r.id AND BINARY a.owner_id=BINARY r.owner_id AND a.table_name='gold_overrides' AND a.batch='study-only-2026-11-01' SET r.is_deleted=1,r.updated_at=a.archived_at WHERE a.restored_at IS NULL;
--> statement-breakpoint
UPDATE settings SET task_epoch=task_epoch+1,updated_at=CURRENT_TIMESTAMP WHERE owner_id='00000000-0000-4000-8000-000000000001';
