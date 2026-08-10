ALTER TABLE "projects" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "projects" ALTER COLUMN "status" TYPE TEXT USING "status"::TEXT;
UPDATE "projects" SET "status" = 'ACTIVE' WHERE "status" = 'DRAFT';
UPDATE "projects" SET "status" = 'ABORTED' WHERE "status" = 'CANCELLED';
DROP TYPE "ProjectStatus";
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ABORTED');
ALTER TABLE "projects" ALTER COLUMN "status" TYPE "ProjectStatus" USING "status"::"ProjectStatus";
ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

CREATE TYPE "ArchiveStatus" AS ENUM ('UNARCHIVED', 'ARCHIVED');
CREATE TYPE "ProjectReviewState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "projects"
  ADD COLUMN "archive_status" "ArchiveStatus" NOT NULL DEFAULT 'UNARCHIVED',
  ADD COLUMN "requested_status" "ProjectStatus",
  ADD COLUMN "status_review_state" "ProjectReviewState",
  ADD COLUMN "status_requested_by_id" UUID,
  ADD COLUMN "status_requested_at" TIMESTAMP(3),
  ADD COLUMN "status_reviewer_id" UUID,
  ADD COLUMN "status_reviewed_at" TIMESTAMP(3),
  ADD COLUMN "requested_archive_status" "ArchiveStatus",
  ADD COLUMN "archive_review_state" "ProjectReviewState",
  ADD COLUMN "archive_requested_by_id" UUID,
  ADD COLUMN "archive_requested_at" TIMESTAMP(3),
  ADD COLUMN "archive_reviewer_id" UUID,
  ADD COLUMN "archive_reviewed_at" TIMESTAMP(3);

CREATE INDEX "projects_status_review_state_archive_review_state_idx"
  ON "projects"("status_review_state", "archive_review_state");

ALTER TABLE "projects" ADD CONSTRAINT "projects_status_requested_by_id_fkey"
  FOREIGN KEY ("status_requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_reviewer_id_fkey"
  FOREIGN KEY ("status_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_archive_requested_by_id_fkey"
  FOREIGN KEY ("archive_requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_archive_reviewer_id_fkey"
  FOREIGN KEY ("archive_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
