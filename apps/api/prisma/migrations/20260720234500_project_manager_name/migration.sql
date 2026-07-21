ALTER TABLE "projects" ADD COLUMN "pm_name" VARCHAR(100);

UPDATE "projects"
SET "pm_name" = "users"."display_name"
FROM "users"
WHERE "projects"."pm_user_id" = "users"."id";

ALTER TABLE "projects" ALTER COLUMN "pm_name" SET NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "pm_user_id" DROP NOT NULL;
