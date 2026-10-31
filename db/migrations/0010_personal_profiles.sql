CREATE TABLE `planner_users` (`id` varchar(36) PRIMARY KEY, `name` varchar(80) NOT NULL, `password_hash` varchar(240) NOT NULL, `session_version` int NOT NULL DEFAULT 0, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE `workspaces` (`id` varchar(36) PRIMARY KEY, `name` varchar(120) NOT NULL, `owner_id` varchar(36) NOT NULL);
--> statement-breakpoint
CREATE TABLE `workspace_members` (`id` varchar(36) PRIMARY KEY, `workspace_id` varchar(36) NOT NULL, `user_id` varchar(36) NOT NULL, UNIQUE KEY `workspace_user` (`workspace_id`,`user_id`));
--> statement-breakpoint
CREATE TABLE `planner_invitations` (`id` varchar(36) PRIMARY KEY, `token_hash` varchar(64) NOT NULL UNIQUE, `workspace_id` varchar(36) NOT NULL, `created_by` varchar(36) NOT NULL, `expires_at` timestamp NOT NULL, `used_at` timestamp NULL);
--> statement-breakpoint
ALTER TABLE `settings` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `projects` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `stages` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `tasks` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `schedule_items` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `schedule_exceptions` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `time_logs` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `transactions` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `journal_entries` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `scheduled_blocks` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `reflow_log` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `task_templates` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `clients` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `deals` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `payments` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `deal_checklist` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `visas` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `flights` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `gold_trades` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `gold_transfers` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `gold_balance` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `gold_rules` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `gold_overrides` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `debts` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `debt_payments` ADD `owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
--> statement-breakpoint
ALTER TABLE `projects` ADD `workspace_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `workspace_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `stages` ADD `workspace_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `scheduled_blocks` ADD `workspace_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `journal_entries` DROP INDEX `journal_entries_date_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_owner_date` ON `journal_entries` (`owner_id`,`date`);
--> statement-breakpoint
ALTER TABLE `gold_rules` DROP INDEX `gold_rules_currency_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `gold_owner_currency` ON `gold_rules` (`owner_id`,`currency`);
--> statement-breakpoint
CREATE TABLE `profile_day_closures` (`owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001', `day` varchar(10) NOT NULL, `note` text NOT NULL, `moved_ids` text NOT NULL, `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`owner_id`,`day`));
--> statement-breakpoint
INSERT IGNORE INTO profile_day_closures (owner_id,day,note,moved_ids,created_at) SELECT '00000000-0000-4000-8000-000000000001',day,note,moved_ids,created_at FROM day_closures;
