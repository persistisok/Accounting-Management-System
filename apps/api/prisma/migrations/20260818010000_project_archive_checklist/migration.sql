CREATE TYPE "ArchiveChecklistStatus" AS ENUM ('NOT_UPLOADED', 'PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "project_archive_items" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "item_key" VARCHAR(64) NOT NULL,
  "status" "ArchiveChecklistStatus" NOT NULL DEFAULT 'NOT_UPLOADED',
  "not_applicable" BOOLEAN NOT NULL DEFAULT false,
  "not_applicable_reason" VARCHAR(500),
  "rejection_reason" VARCHAR(500),
  "uploaded_by_id" UUID,
  "submitted_at" TIMESTAMP(3),
  "reviewer_id" UUID,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_archive_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_archive_items_project_id_item_key_key" ON "project_archive_items"("project_id", "item_key");
CREATE INDEX "project_archive_items_project_id_status_idx" ON "project_archive_items"("project_id", "status");
ALTER TABLE "project_archive_items" ADD CONSTRAINT "project_archive_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_archive_items" ADD CONSTRAINT "project_archive_items_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_archive_items" ADD CONSTRAINT "project_archive_items_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
