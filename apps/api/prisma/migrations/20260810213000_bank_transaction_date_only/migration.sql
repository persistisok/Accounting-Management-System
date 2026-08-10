ALTER TABLE "bank_transactions"
ALTER COLUMN "transaction_at" TYPE DATE
USING "transaction_at"::date;
