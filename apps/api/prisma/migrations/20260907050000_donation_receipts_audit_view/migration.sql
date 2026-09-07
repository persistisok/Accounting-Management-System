ALTER TYPE "PermissionResource" ADD VALUE IF NOT EXISTS 'DONATION_RECEIPTS';

CREATE TYPE "DonationReceiptStatus" AS ENUM ('NORMAL', 'VOID');

CREATE TABLE "donation_receipts" (
  "id" UUID NOT NULL,
  "receipt_number" VARCHAR(64) NOT NULL,
  "project_id" UUID NOT NULL,
  "donor_id" UUID NOT NULL,
  "issued_on" DATE NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "remark" VARCHAR(500),
  "status" "DonationReceiptStatus" NOT NULL DEFAULT 'NORMAL',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "donation_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "donation_receipts_receipt_number_key" ON "donation_receipts"("receipt_number");
CREATE INDEX "donation_receipts_project_id_status_issued_on_idx" ON "donation_receipts"("project_id", "status", "issued_on");
CREATE INDEX "donation_receipts_donor_id_status_issued_on_idx" ON "donation_receipts"("donor_id", "status", "issued_on");

ALTER TABLE "donation_receipts" ADD CONSTRAINT "donation_receipts_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "donation_receipts" ADD CONSTRAINT "donation_receipts_donor_id_fkey"
  FOREIGN KEY ("donor_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
