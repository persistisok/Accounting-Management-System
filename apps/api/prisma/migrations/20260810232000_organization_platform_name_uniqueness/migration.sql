DROP INDEX IF EXISTS "organizations_normalized_name_key";

ALTER TABLE "organizations"
ADD COLUMN "normalized_platform" VARCHAR(100);

UPDATE "organizations"
SET "normalized_platform" = lower(regexp_replace("platform", '[[:space:]]', '', 'g'));

ALTER TABLE "organizations"
ALTER COLUMN "normalized_platform" SET NOT NULL;

CREATE UNIQUE INDEX "organizations_normalized_platform_normalized_name_key"
ON "organizations"("normalized_platform", "normalized_name");
