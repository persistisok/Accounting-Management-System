ALTER TYPE "PermissionLevel" ADD VALUE IF NOT EXISTS 'ENTRY' AFTER 'VIEW';

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('SYSTEM_ADMIN', 'ADMIN', 'PM', 'EXTERNAL');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING (
  CASE WHEN "role"::text = 'GUEST' THEN 'EXTERNAL' ELSE "role"::text END
)::"UserRole";
DROP TYPE "UserRole_old";

CREATE TABLE "user_project_scopes" (
  "user_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_project_scopes_pkey" PRIMARY KEY ("user_id", "project_id"),
  CONSTRAINT "user_project_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_project_scopes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_project_scopes_project_id_idx" ON "user_project_scopes"("project_id");
