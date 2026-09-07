ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_business_reference_check";

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_business_reference_check" CHECK (
    ("category" = 'MEMBER_DUE_ISSUED' AND "membership_id" IS NOT NULL AND "expert_profile_id" IS NULL AND "direction" = 'ISSUED') OR
    ("category" = 'SUPPORT_RECEIPT_ISSUED' AND "project_id" IS NOT NULL AND "membership_id" IS NULL AND "expert_profile_id" IS NULL AND "direction" = 'ISSUED') OR
    ("category" = 'EXECUTION_PAYMENT_RECEIVED' AND "project_id" IS NOT NULL AND "membership_id" IS NULL AND "expert_profile_id" IS NULL AND "direction" = 'RECEIVED') OR
    ("category" = 'EXPERT_FEE_RECEIVED' AND "project_id" IS NOT NULL AND "membership_id" IS NULL AND "expert_profile_id" IS NOT NULL AND "direction" = 'RECEIVED')
  ) NOT VALID;
