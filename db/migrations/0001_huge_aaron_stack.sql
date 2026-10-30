ALTER TABLE `settings` MODIFY COLUMN `daily_limit` int NOT NULL DEFAULT 180000;--> statement-breakpoint
ALTER TABLE `settings` MODIFY COLUMN `monthly_limit` int NOT NULL DEFAULT 4500000;--> statement-breakpoint
ALTER TABLE `settings` MODIFY COLUMN `cushion` int NOT NULL DEFAULT 500000;--> statement-breakpoint
ALTER TABLE `transactions` ADD `currency` varchar(8) DEFAULT 'RUB' NOT NULL;
--> statement-breakpoint
UPDATE transactions SET amount = amount * 100, currency = COALESCE((SELECT CASE currency WHEN '$' THEN 'USD' WHEN '€' THEN 'EUR' WHEN '₸' THEN 'KZT' WHEN 'TJS' THEN 'TJS' ELSE 'RUB' END FROM settings LIMIT 1), 'RUB');
--> statement-breakpoint
UPDATE projects SET expected_income = expected_income * 100, actual_income = actual_income * 100;
--> statement-breakpoint
UPDATE settings SET daily_limit = daily_limit * 100, monthly_limit = monthly_limit * 100, cushion = cushion * 100;
