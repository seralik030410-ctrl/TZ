ALTER TABLE `schedule_items` ADD `project_id` varchar(36) NULL;
--> statement-breakpoint
UPDATE schedule_items s SET s.project_id=(SELECT MIN(p.id) FROM projects p WHERE p.owner_id='00000000-0000-4000-8000-000000000001' AND p.is_deleted=0 AND LOWER(TRIM(p.name)) IN ('запись корея','запись в корею','запись в корео'))
WHERE s.owner_id='00000000-0000-4000-8000-000000000001' AND s.is_deleted=0 AND s.title='Запись в Корео' AND s.project_id IS NULL;
