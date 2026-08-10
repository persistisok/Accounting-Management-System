ALTER TABLE "projects" ADD COLUMN "project_type" VARCHAR(50);

UPDATE "projects" SET "project_type" = '未分类' WHERE "project_type" IS NULL;

ALTER TABLE "projects" ALTER COLUMN "project_type" SET NOT NULL;
