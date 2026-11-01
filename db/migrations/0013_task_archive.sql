ALTER TABLE `settings` ADD `task_epoch` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `task_archive_batches` (
  `id` varchar(36) NOT NULL PRIMARY KEY,
  `owner_id` varchar(36) NOT NULL,
  `month` varchar(7) NOT NULL,
  `snapshot` longtext NOT NULL,
  `revision` varchar(64) NOT NULL,
  `restored_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
