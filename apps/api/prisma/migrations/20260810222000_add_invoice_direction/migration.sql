CREATE TYPE "InvoiceDirection" AS ENUM ('ISSUED', 'RECEIVED');

ALTER TABLE "invoices"
ADD COLUMN "direction" "InvoiceDirection" NOT NULL DEFAULT 'ISSUED';

CREATE INDEX "invoices_direction_status_issued_on_idx"
ON "invoices"("direction", "status", "issued_on");
