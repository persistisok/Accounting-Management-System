ALTER TABLE "memberships"
  ADD COLUMN "organization_name" VARCHAR(200),
  ADD COLUMN "department" VARCHAR(100),
  ADD COLUMN "id_number_encrypted" TEXT,
  ADD COLUMN "id_number_hash" VARCHAR(64),
  ADD COLUMN "id_number_masked" VARCHAR(32),
  ADD COLUMN "phone_encrypted" TEXT,
  ADD COLUMN "phone_masked" VARCHAR(30),
  ADD COLUMN "email" VARCHAR(200);

CREATE UNIQUE INDEX "memberships_id_number_hash_key" ON "memberships"("id_number_hash");
CREATE INDEX "memberships_organization_name_department_idx" ON "memberships"("organization_name", "department");
