ALTER TABLE "projects" ADD COLUMN "period" VARCHAR(100);

UPDATE "projects"
SET "period" = TO_CHAR("period_start", 'YYYY/MM/DD') || ' 至 ' || TO_CHAR("period_end", 'YYYY/MM/DD');

ALTER TABLE "projects" ALTER COLUMN "period" SET NOT NULL;
ALTER TABLE "projects" DROP COLUMN "period_start";
ALTER TABLE "projects" DROP COLUMN "period_end";
ALTER TABLE "projects" RENAME COLUMN "execution_budget" TO "execution_cost";
