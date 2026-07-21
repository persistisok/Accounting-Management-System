CREATE TABLE "project_code_counters" (
  "year" INTEGER NOT NULL,
  "next_number" INTEGER NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_code_counters_pkey" PRIMARY KEY ("year"),
  CONSTRAINT "project_code_counters_next_number_check" CHECK ("next_number" > 0)
);

INSERT INTO "project_code_counters" ("year", "next_number")
SELECT
  CAST(SPLIT_PART("project_code", '-', 2) AS INTEGER),
  MAX(CAST(SPLIT_PART("project_code", '-', 3) AS INTEGER)) + 1
FROM "projects"
WHERE "project_code" ~ '^PRJ-[0-9]{4}-[0-9]+$'
GROUP BY CAST(SPLIT_PART("project_code", '-', 2) AS INTEGER);
