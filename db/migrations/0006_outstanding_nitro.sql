CREATE TABLE `day_closures` (
	`day` varchar(10) NOT NULL,
	`note` text NOT NULL,
	`moved_ids` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `day_closures_day` PRIMARY KEY(`day`)
);
--> statement-breakpoint
CREATE TABLE `task_templates` (
	`id` varchar(36) NOT NULL,
	`title` varchar(240) NOT NULL,
	`estimate_min` int NOT NULL DEFAULT 30,
	`weekdays` varchar(32),
	`starts_on` varchar(10) NOT NULL,
	`ends_on` varchar(10),
	`paused` boolean NOT NULL DEFAULT false,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tasks` MODIFY COLUMN `recurrence` varchar(36);