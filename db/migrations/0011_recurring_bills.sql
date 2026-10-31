ALTER TABLE `settings` ADD `monthly_savings` int NOT NULL DEFAULT 0;
--> statement-breakpoint

CREATE TABLE `recurring_bills` (
	`id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'TJS',
	`due_day` int NOT NULL,
	`category` varchar(80) NOT NULL DEFAULT 'Обязательные платежи',
	`paid_through` varchar(7),
	`owner_id` varchar(36) NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recurring_bills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `recurring_bills_owner_active` ON `recurring_bills` (`owner_id`, `is_deleted`);
