ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PM';

CREATE TYPE "PermissionResource" AS ENUM (
  'PROJECTS', 'CONTRACTS', 'BANKING', 'INVOICES',
  'SUPPORTERS', 'EXECUTORS', 'EXPERTS', 'MEMBERS'
);

CREATE TYPE "PermissionLevel" AS ENUM ('VIEW', 'EDIT', 'REVIEW');

CREATE TABLE "user_permissions" (
  "user_id" UUID NOT NULL,
  "resource" "PermissionResource" NOT NULL,
  "level" "PermissionLevel" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id", "resource")
);

CREATE INDEX "user_permissions_resource_level_idx" ON "user_permissions"("resource", "level");

ALTER TABLE "user_permissions"
  ADD CONSTRAINT "user_permissions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the effective access of existing ordinary administrators.
INSERT INTO "user_permissions" ("user_id", "resource", "level", "updated_at")
SELECT u."id", resource, 'EDIT'::"PermissionLevel", CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN unnest(enum_range(NULL::"PermissionResource")) AS resource
WHERE u."role" = 'ADMIN';
