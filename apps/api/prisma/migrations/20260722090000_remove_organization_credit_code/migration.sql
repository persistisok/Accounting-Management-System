DROP INDEX IF EXISTS "organizations_credit_code_key";
DROP INDEX IF EXISTS "organizations_normalized_name_idx";

ALTER TABLE "organizations"
DROP COLUMN "credit_code";

CREATE UNIQUE INDEX "organizations_normalized_name_key"
ON "organizations"("normalized_name");
