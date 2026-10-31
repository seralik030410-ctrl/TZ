ALTER TABLE `tasks` ADD `schedule_item_id` varchar(36);
--> statement-breakpoint
CREATE INDEX `tasks_schedule_item_id` ON `tasks` (`schedule_item_id`);
