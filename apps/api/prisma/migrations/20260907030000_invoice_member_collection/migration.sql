CREATE TYPE "InvoiceCollectionStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'COLLECTED');

ALTER TABLE "invoices"
  ADD COLUMN "payer_name" VARCHAR(200),
  ADD COLUMN "collection_status" "InvoiceCollectionStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "collected_by_id" UUID,
  ADD COLUMN "collected_at" TIMESTAMP(3);

UPDATE "invoices" AS invoice
SET
  "payer_name" = membership."member_name",
  "collection_status" = 'COLLECTED',
  "collected_at" = invoice."created_at"
FROM "memberships" AS membership
WHERE invoice."category" = 'MEMBER_DUE_ISSUED'
  AND invoice."membership_id" = membership."id";

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_collected_by_id_fkey"
  FOREIGN KEY ("collected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_business_reference_check";

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_business_reference_check" CHECK (
    ("category" = 'MEMBER_DUE_ISSUED' AND "expert_profile_id" IS NULL AND "direction" = 'ISSUED' AND (
      ("collection_status" = 'PENDING' AND "membership_id" IS NULL) OR
      ("collection_status" = 'COLLECTED' AND "membership_id" IS NOT NULL)
    )) OR
    ("category" = 'SUPPORT_RECEIPT_ISSUED' AND "project_id" IS NOT NULL AND "membership_id" IS NULL AND "expert_profile_id" IS NULL AND "direction" = 'ISSUED' AND "collection_status" = 'NOT_APPLICABLE') OR
    ("category" = 'EXECUTION_PAYMENT_RECEIVED' AND "project_id" IS NOT NULL AND "membership_id" IS NULL AND "expert_profile_id" IS NULL AND "direction" = 'RECEIVED' AND "collection_status" = 'NOT_APPLICABLE') OR
    ("category" = 'EXPERT_FEE_RECEIVED' AND "project_id" IS NOT NULL AND "membership_id" IS NULL AND "expert_profile_id" IS NOT NULL AND "direction" = 'RECEIVED' AND "collection_status" = 'NOT_APPLICABLE')
  ) NOT VALID;

CREATE INDEX "invoices_category_collection_status_issued_on_idx"
  ON "invoices"("category", "collection_status", "issued_on");
