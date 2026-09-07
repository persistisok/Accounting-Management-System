ALTER TABLE "donation_receipts"
  ADD COLUMN "donor_name" VARCHAR(200),
  ADD COLUMN "phone_encrypted" TEXT,
  ADD COLUMN "phone_masked" VARCHAR(30),
  ADD COLUMN "invoice_type" VARCHAR(30),
  ADD COLUMN "invoice_platform" VARCHAR(100),
  ADD COLUMN "seller_name" VARCHAR(200),
  ADD COLUMN "total_amount" DECIMAL(18,2),
  ADD COLUMN "tax_rate" DECIMAL(8,6),
  ADD COLUMN "amount_excluding_tax" DECIMAL(18,2),
  ADD COLUMN "tax_amount" DECIMAL(18,2);

UPDATE "donation_receipts" AS receipt
SET
  "donor_name" = organization."name",
  "invoice_type" = '捐赠票据',
  "invoice_platform" = '历史数据',
  "seller_name" = '历史数据',
  "total_amount" = receipt."amount",
  "tax_rate" = 0,
  "amount_excluding_tax" = receipt."amount",
  "tax_amount" = 0
FROM "organizations" AS organization
WHERE organization."id" = receipt."donor_id";

ALTER TABLE "donation_receipts"
  ALTER COLUMN "donor_name" SET NOT NULL,
  ALTER COLUMN "invoice_type" SET NOT NULL,
  ALTER COLUMN "invoice_platform" SET NOT NULL,
  ALTER COLUMN "seller_name" SET NOT NULL,
  ALTER COLUMN "total_amount" SET NOT NULL,
  ALTER COLUMN "tax_rate" SET NOT NULL,
  ALTER COLUMN "amount_excluding_tax" SET NOT NULL,
  ALTER COLUMN "tax_amount" SET NOT NULL;

ALTER TABLE "donation_receipts" DROP CONSTRAINT IF EXISTS "donation_receipts_project_id_fkey";
ALTER TABLE "donation_receipts" DROP CONSTRAINT IF EXISTS "donation_receipts_donor_id_fkey";
DROP INDEX IF EXISTS "donation_receipts_receipt_number_key";
DROP INDEX IF EXISTS "donation_receipts_project_id_status_issued_on_idx";
DROP INDEX IF EXISTS "donation_receipts_donor_id_status_issued_on_idx";

ALTER TABLE "donation_receipts"
  DROP COLUMN "receipt_number",
  DROP COLUMN "project_id",
  DROP COLUMN "donor_id",
  DROP COLUMN "amount",
  DROP COLUMN "remark";

CREATE INDEX "donation_receipts_status_issued_on_idx" ON "donation_receipts"("status", "issued_on");
CREATE INDEX "donation_receipts_donor_name_issued_on_idx" ON "donation_receipts"("donor_name", "issued_on");
