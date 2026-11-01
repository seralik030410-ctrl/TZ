ALTER TABLE `transactions` ADD `status` varchar(16) NOT NULL DEFAULT 'posted';
--> statement-breakpoint
ALTER TABLE `transactions` ADD `expected_on` varchar(10) NULL;
