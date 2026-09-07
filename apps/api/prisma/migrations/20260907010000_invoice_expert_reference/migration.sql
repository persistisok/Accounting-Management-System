ALTER TABLE "invoices"
  ADD COLUMN "expert_profile_id" UUID;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_expert_profile_id_fkey"
  FOREIGN KEY ("expert_profile_id") REFERENCES "expert_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" DROP CONSTRAINT "invoices_business_reference_check";

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_business_reference_check" CHECK (
    ("category" = 'MEMBER_DUE_ISSUED' AND "membership_id" IS NOT NULL AND "project_id" IS NULL AND "expert_profile_id" IS NULL AND "direction" = 'ISSUED') OR
    ("category" = 'SUPPORT_RECEIPT_ISSUED' AND "project_id" IS NOT NULL AND "membership_id" IS NULL AND "expert_profile_id" IS NULL AND "direction" = 'ISSUED') OR
    ("category" = 'EXECUTION_PAYMENT_RECEIVED' AND "project_id" IS NOT NULL AND "membership_id" IS NULL AND "expert_profile_id" IS NULL AND "direction" = 'RECEIVED') OR
    ("category" = 'EXPERT_FEE_RECEIVED' AND "project_id" IS NOT NULL AND "membership_id" IS NULL AND "expert_profile_id" IS NOT NULL AND "direction" = 'RECEIVED')
  ) NOT VALID;

CREATE INDEX "invoices_expert_profile_id_status_issued_on_idx"
  ON "invoices"("expert_profile_id", "status", "issued_on");
