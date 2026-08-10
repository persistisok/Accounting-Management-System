ALTER TABLE "memberships"
ADD COLUMN "member_position" VARCHAR(50),
ADD COLUMN "certificate_issued" BOOLEAN NOT NULL DEFAULT false;
