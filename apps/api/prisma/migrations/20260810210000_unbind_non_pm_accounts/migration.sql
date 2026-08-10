-- Only PM accounts may reserve the one-to-one project manager binding.
UPDATE "users"
SET "project_manager_id" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "role" <> 'PM'
  AND "project_manager_id" IS NOT NULL;
