ALTER TABLE `gold_rules` ADD `lock_until` varchar(40);--> statement-breakpoint
ALTER TABLE `gold_rules` ADD `lock_reason` varchar(180);--> statement-breakpoint
ALTER TABLE `gold_rules` ADD `lock_key` text;