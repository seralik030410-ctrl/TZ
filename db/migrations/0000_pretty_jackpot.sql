CREATE TABLE `journal_entries` (
	`id` varchar(36) NOT NULL,
	`date` varchar(10) NOT NULL,
	`mood` int NOT NULL DEFAULT 3,
	`energy` int NOT NULL DEFAULT 3,
	`done` text,
	`failed` text,
	`insight` text,
	`gratitude` text,
	`text` text,
	`tags` varchar(240) NOT NULL DEFAULT '',
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `journal_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `journal_entries_date_unique` UNIQUE(`date`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`type` varchar(32) NOT NULL DEFAULT 'personal',
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`deadline` varchar(10),
	`priority` int NOT NULL DEFAULT 2,
	`next_step` text,
	`daily_minutes_goal` int NOT NULL DEFAULT 60,
	`weekly_minutes_goal` int NOT NULL DEFAULT 300,
	`expected_income` int NOT NULL DEFAULT 0,
	`actual_income` int NOT NULL DEFAULT 0,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `reflow_log` (
	`id` varchar(36) NOT NULL,
	`reason` varchar(240) NOT NULL,
	`changes` text NOT NULL,
	`applied` boolean NOT NULL DEFAULT true,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reflow_log_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `schedule_exceptions` (
	`id` varchar(36) NOT NULL,
	`item_id` varchar(36) NOT NULL,
	`date` varchar(10) NOT NULL,
	`action` varchar(24) NOT NULL,
	`start_min` int,
	`end_min` int,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_exceptions_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `schedule_items` (
	`id` varchar(36) NOT NULL,
	`title` varchar(180) NOT NULL,
	`kind` varchar(24) NOT NULL,
	`start_min` int NOT NULL,
	`end_min` int NOT NULL,
	`weekdays` varchar(32) NOT NULL DEFAULT '1,2,3,4,5',
	`week_parity` varchar(16) NOT NULL DEFAULT 'all',
	`location` varchar(180),
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_items_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `scheduled_blocks` (
	`id` varchar(36) NOT NULL,
	`task_id` varchar(36) NOT NULL,
	`start` timestamp NOT NULL,
	`end` timestamp NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'planned',
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_blocks_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL DEFAULT 'Алекс',
	`currency` varchar(8) NOT NULL DEFAULT '₽',
	`daily_limit` int NOT NULL DEFAULT 1800,
	`monthly_limit` int NOT NULL DEFAULT 45000,
	`work_start_min` int NOT NULL DEFAULT 480,
	`work_end_min` int NOT NULL DEFAULT 1320,
	`theme` varchar(16) NOT NULL DEFAULT 'light',
	`auto_reflow` boolean NOT NULL DEFAULT false,
	`cushion` int NOT NULL DEFAULT 5000,
	`timezone` varchar(80) NOT NULL DEFAULT 'Asia/Dushanbe',
	`agency_enabled` boolean NOT NULL DEFAULT true,
	`gold_enabled` boolean NOT NULL DEFAULT true,
	`debts_enabled` boolean NOT NULL DEFAULT true,
	`agency_goal` int NOT NULL DEFAULT 10000000,
	`agency_goal_currency` varchar(8) NOT NULL DEFAULT 'TJS',
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `stages` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`deadline` varchar(10),
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stages_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36),
	`stage_id` varchar(36),
	`title` varchar(240) NOT NULL,
	`notes` text,
	`due` varchar(10),
	`estimate_min` int NOT NULL DEFAULT 30,
	`importance` int NOT NULL DEFAULT 2,
	`status` varchar(32) NOT NULL DEFAULT 'plan',
	`is_mit` boolean NOT NULL DEFAULT false,
	`recurrence` varchar(32),
	`flexibility` varchar(24) NOT NULL DEFAULT 'flexible',
	`depends_on` varchar(36),
	`planned_start` timestamp,
	`planned_end` timestamp,
	`position` int NOT NULL DEFAULT 0,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `time_logs` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`task_id` varchar(36),
	`start` timestamp NOT NULL,
	`end` timestamp,
	`minutes` int NOT NULL DEFAULT 0,
	`note` text,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `time_logs_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` varchar(36) NOT NULL,
	`kind` varchar(16) NOT NULL,
	`amount` int NOT NULL,
	`category` varchar(80) NOT NULL DEFAULT 'Прочее',
	`project_id` varchar(36),
	`note` text,
	`happened_at` timestamp NOT NULL DEFAULT (now()),
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deal_id` varchar(36) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(8) NOT NULL,
	`date` varchar(10) NOT NULL,
	`method` varchar(80) NOT NULL,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`name` varchar(180) NOT NULL,
	`phone` varchar(180) NOT NULL,
	`messenger` varchar(180) NOT NULL,
	`source` varchar(180) NOT NULL,
	`notes` text NOT NULL,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `deal_checklist` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deal_id` varchar(36) NOT NULL,
	`title` varchar(180) NOT NULL,
	`done` boolean NOT NULL DEFAULT false,
	CONSTRAINT `deal_checklist_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`client_id` varchar(36) NOT NULL,
	`type` varchar(16) NOT NULL,
	`title` varchar(180) NOT NULL,
	`status` varchar(16) NOT NULL,
	`requested_on` varchar(10) NOT NULL,
	`departure_on` varchar(10),
	`return_on` varchar(10),
	`payment_due` varchar(10),
	`completed_on` varchar(10),
	`sale` int NOT NULL,
	`cost` int NOT NULL,
	`commission` int NOT NULL DEFAULT 0,
	`currency` varchar(8) NOT NULL,
	CONSTRAINT `deals_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `flights` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deal_id` varchar(36) NOT NULL,
	`route` varchar(180) NOT NULL,
	`airline` varchar(180) NOT NULL,
	`booking` varchar(80) NOT NULL,
	`departure_at` varchar(40) NOT NULL,
	`passengers` varchar(180) NOT NULL,
	CONSTRAINT `flights_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `visas` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deal_id` varchar(36) NOT NULL,
	`country` varchar(180) NOT NULL,
	`type` varchar(180) NOT NULL,
	`status` varchar(16) NOT NULL,
	`submission_on` varchar(10),
	`ready_on` varchar(10),
	CONSTRAINT `visas_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `gold_balance` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`date` varchar(10) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(8) NOT NULL,
	CONSTRAINT `gold_balance_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `gold_overrides` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`currency` varchar(8) NOT NULL,
	`date` varchar(40) NOT NULL,
	`reason` text NOT NULL,
	`state_key` text NOT NULL,
	`until_at` varchar(40) NOT NULL,
	CONSTRAINT `gold_overrides_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `gold_rules` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`currency` varchar(8) NOT NULL,
	`daily_loss` int NOT NULL,
	`daily_goal` int NOT NULL,
	`max_trades` int NOT NULL,
	`max_risk_percent` decimal(9,6) NOT NULL,
	`pause_after` int NOT NULL,
	`pause_minutes` int NOT NULL,
	`phrase_hash` varchar(256) NOT NULL,
	CONSTRAINT `gold_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `gold_rules_currency_unique` UNIQUE(`currency`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `gold_trades` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`date` varchar(40) NOT NULL,
	`direction` varchar(8),
	`instrument` varchar(40) NOT NULL,
	`size` decimal(16,6),
	`entry` decimal(16,6),
	`exit_price` decimal(16,6),
	`result` int NOT NULL,
	`commission` int NOT NULL,
	`currency` varchar(8) NOT NULL,
	`reason` varchar(180) NOT NULL,
	`state` varchar(16) NOT NULL,
	`comment` text NOT NULL,
	`status` varchar(8) NOT NULL,
	`risk_percent` decimal(9,6),
	CONSTRAINT `gold_trades_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `gold_transfers` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`type` varchar(16) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(8) NOT NULL,
	`date` varchar(10) NOT NULL,
	`note` text NOT NULL,
	CONSTRAINT `gold_transfers_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `debt_payments` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`debt_id` varchar(36) NOT NULL,
	`amount` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`note` text NOT NULL,
	CONSTRAINT `debt_payments_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` varchar(36) NOT NULL,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`direction` varchar(16) NOT NULL,
	`counterparty` varchar(180) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(8) NOT NULL,
	`borrowed_on` varchar(10) NOT NULL,
	`due_on` varchar(10),
	`note` text NOT NULL,
	`status` varchar(12) NOT NULL,
	CONSTRAINT `debts_id` PRIMARY KEY(`id`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deal_checklist` ADD CONSTRAINT `deal_checklist_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deals` ADD CONSTRAINT `deals_client_id_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flights` ADD CONSTRAINT `flights_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `visas` ADD CONSTRAINT `visas_deal_id_deals_id_fk` FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debt_payments` ADD CONSTRAINT `debt_payments_debt_id_debts_id_fk` FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `gold_currency_date` ON `gold_trades` (`currency`,`date`);--> statement-breakpoint
CREATE INDEX `debts_due_status` ON `debts` (`due_on`,`status`);