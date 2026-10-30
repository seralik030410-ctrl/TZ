ALTER TABLE `task_templates` ADD `start_min` int;
--> statement-breakpoint
ALTER TABLE `settings` MODIFY `currency` varchar(8) NOT NULL DEFAULT 'TJS';
--> statement-breakpoint
ALTER TABLE `settings` MODIFY `daily_limit` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `settings` MODIFY `monthly_limit` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `settings` MODIFY `cushion` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `transactions` MODIFY `currency` varchar(8) NOT NULL DEFAULT 'TJS';
--> statement-breakpoint
UPDATE `settings` SET `daily_limit`=0, `monthly_limit`=0, `cushion`=0 WHERE `daily_limit`=180000 AND `monthly_limit`=4500000 AND `cushion`=500000;
--> statement-breakpoint
UPDATE `settings` SET `currency`='TJS';
--> statement-breakpoint
ALTER TABLE `task_templates` ADD `is_mit` boolean NOT NULL DEFAULT false;
