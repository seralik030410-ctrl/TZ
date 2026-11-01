UPDATE tasks t
JOIN stages s ON BINARY s.id=BINARY t.stage_id
JOIN projects p ON BINARY p.id=BINARY s.project_id
SET t.stage_id=NULL,t.updated_at=CURRENT_TIMESTAMP
WHERE s.owner_id='00000000-0000-4000-8000-000000000001'
AND p.owner_id=s.owner_id AND t.owner_id=s.owner_id
AND s.workspace_id IS NULL AND t.workspace_id IS NULL
AND LOWER(TRIM(p.name)) IN ('корея','korea')
AND LOWER(TRIM(s.name))='фарзона';
--> statement-breakpoint
UPDATE stages s JOIN projects p ON BINARY p.id=BINARY s.project_id
SET s.is_deleted=1,s.updated_at=CURRENT_TIMESTAMP
WHERE s.owner_id='00000000-0000-4000-8000-000000000001'
AND p.owner_id=s.owner_id AND s.workspace_id IS NULL
AND LOWER(TRIM(p.name)) IN ('корея','korea')
AND LOWER(TRIM(s.name))='фарзона';
