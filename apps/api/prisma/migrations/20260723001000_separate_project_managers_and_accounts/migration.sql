CREATE TABLE "project_managers" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "department" VARCHAR(100),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_managers_pkey" PRIMARY KEY ("id")
);

INSERT INTO "project_managers" ("id", "display_name", "department", "status", "created_at", "updated_at")
SELECT DISTINCT u."id", u."display_name", u."department", u."status", u."created_at", u."updated_at"
FROM "users" u
WHERE u."role" = 'PM'
   OR u."id" IN (
       SELECT "pm_user_id" FROM "projects" WHERE "pm_user_id" IS NOT NULL
       UNION SELECT "owner_user_id" FROM "organizations"
       UNION SELECT "form_owner_id" FROM "expert_profiles"
       UNION SELECT "owner_user_id" FROM "committees"
       UNION SELECT "pm_user_id" FROM "memberships"
   );

DROP INDEX IF EXISTS "projects_pm_user_id_status_idx";
ALTER TABLE "projects" DROP CONSTRAINT "projects_pm_user_id_fkey";
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_owner_user_id_fkey";
ALTER TABLE "expert_profiles" DROP CONSTRAINT "expert_profiles_form_owner_id_fkey";
ALTER TABLE "committees" DROP CONSTRAINT "committees_owner_user_id_fkey";
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_pm_user_id_fkey";

ALTER TABLE "projects" ADD CONSTRAINT "projects_pm_user_id_fkey" FOREIGN KEY ("pm_user_id") REFERENCES "project_managers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "project_managers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_form_owner_id_fkey" FOREIGN KEY ("form_owner_id") REFERENCES "project_managers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "committees" ADD CONSTRAINT "committees_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "project_managers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_pm_user_id_fkey" FOREIGN KEY ("pm_user_id") REFERENCES "project_managers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "project_managers_status_display_name_idx" ON "project_managers"("status", "display_name");
CREATE INDEX "projects_pm_user_id_status_idx" ON "projects"("pm_user_id", "status");

ALTER TABLE "users" ADD COLUMN "project_manager_id" UUID;
CREATE UNIQUE INDEX "users_project_manager_id_key" ON "users"("project_manager_id");
ALTER TABLE "users" ADD CONSTRAINT "users_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "project_managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DELETE FROM "users" u
WHERE u."role" = 'PM'
  AND NOT EXISTS (SELECT 1 FROM "expert_profiles" e WHERE e."reviewer_id" = u."id");

ALTER TABLE "users" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;
UPDATE "users" SET "role" = 'GUEST', "status" = 'INACTIVE' WHERE "role" = 'PM';
UPDATE "users" SET "role" = 'GUEST' WHERE "role" NOT IN ('ADMIN', 'GUEST');
DROP TYPE "UserRole";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'GUEST');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING "role"::"UserRole";
ALTER TABLE "users" DROP COLUMN "department";
