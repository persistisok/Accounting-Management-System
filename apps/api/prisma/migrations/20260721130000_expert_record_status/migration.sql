ALTER TABLE "expert_profiles"
ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';

DROP INDEX IF EXISTS "expert_profiles_review_status_joined_on_idx";
CREATE INDEX "expert_profiles_status_review_status_joined_on_idx"
ON "expert_profiles"("status", "review_status", "joined_on");
