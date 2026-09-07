ALTER TABLE "memberships"
  ALTER COLUMN "committee_id" DROP NOT NULL,
  ADD COLUMN "committee_member_status" VARCHAR(20) DEFAULT 'IN_OFFICE',
  ADD COLUMN "committee_term" INTEGER,
  ADD COLUMN "appointment_letter_issued" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_committee_member_status_check"
  CHECK ("committee_member_status" IS NULL OR "committee_member_status" IN ('IN_OFFICE', 'LEFT_OFFICE'));

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_committee_term_check"
  CHECK ("committee_term" IS NULL OR "committee_term" > 0);
