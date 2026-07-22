ALTER TABLE "bank_accounts"
ADD COLUMN "account_number_hash" VARCHAR(64);

CREATE UNIQUE INDEX "bank_accounts_account_number_hash_key"
ON "bank_accounts"("account_number_hash");

ALTER TABLE "bank_transactions"
ADD COLUMN "counterparty_bank_name" VARCHAR(200),
ADD COLUMN "counterparty_account_encrypted" TEXT;
