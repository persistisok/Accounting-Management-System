CREATE TYPE "InvoiceCategory" AS ENUM (
  'SUPPORT_RECEIPT_ISSUED',
  'MEMBER_DUE_ISSUED',
  'EXECUTION_PAYMENT_RECEIVED',
  'EXPERT_FEE_RECEIVED'
);

ALTER TABLE "invoices"
  ADD COLUMN "category" "InvoiceCategory" NOT NULL DEFAULT 'SUPPORT_RECEIPT_ISSUED',
  ADD COLUMN "membership_id" UUID,
  ALTER COLUMN "project_id" DROP NOT NULL;

UPDATE "invoices"
SET "category" = CASE
  WHEN "direction" = 'RECEIVED' THEN 'EXECUTION_PAYMENT_RECEIVED'::"InvoiceCategory"
  ELSE 'SUPPORT_RECEIPT_ISSUED'::"InvoiceCategory"
END;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_business_reference_check" CHECK (
    ("category" = 'MEMBER_DUE_ISSUED' AND "membership_id" IS NOT NULL AND "project_id" IS NULL AND "direction" = 'ISSUED') OR
    ("category" <> 'MEMBER_DUE_ISSUED' AND "project_id" IS NOT NULL AND "membership_id" IS NULL AND
      (("category" = 'SUPPORT_RECEIPT_ISSUED' AND "direction" = 'ISSUED') OR
       ("category" IN ('EXECUTION_PAYMENT_RECEIVED', 'EXPERT_FEE_RECEIVED') AND "direction" = 'RECEIVED')))
  );

CREATE INDEX "invoices_category_status_issued_on_idx" ON "invoices"("category", "status", "issued_on");
CREATE INDEX "invoices_membership_id_status_issued_on_idx" ON "invoices"("membership_id", "status", "issued_on");
