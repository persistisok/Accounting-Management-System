ALTER TABLE "projects" ADD COLUMN "period_months" INTEGER;

UPDATE "projects"
SET "period_months" = GREATEST(
  1,
  ROUND(
    (TO_DATE(SPLIT_PART("period", ' 至 ', 2), 'YYYY/MM/DD') - TO_DATE(SPLIT_PART("period", ' 至 ', 1), 'YYYY/MM/DD')) / 30.4375
  )::INTEGER
)
WHERE "period" ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2} 至 [0-9]{4}/[0-9]{2}/[0-9]{2}$';

UPDATE "projects" SET "period_months" = 12 WHERE "period_months" IS NULL;

ALTER TABLE "projects" ALTER COLUMN "period_months" SET NOT NULL;
ALTER TABLE "projects" ADD CONSTRAINT "projects_period_months_check" CHECK ("period_months" > 0 AND "period_months" <= 1200);
ALTER TABLE "projects" DROP COLUMN "period";
