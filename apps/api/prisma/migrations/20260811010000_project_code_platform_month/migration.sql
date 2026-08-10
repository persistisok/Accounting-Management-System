ALTER TABLE "projects"
ADD COLUMN "platform_abbreviation" VARCHAR(10);

DROP TABLE "project_code_counters";

CREATE TABLE "project_code_counters" (
  "platform_abbreviation" VARCHAR(10) NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "next_number" INTEGER NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_code_counters_pkey" PRIMARY KEY ("platform_abbreviation", "year", "month"),
  CONSTRAINT "project_code_counters_month_check" CHECK ("month" BETWEEN 1 AND 12),
  CONSTRAINT "project_code_counters_next_number_check" CHECK ("next_number" > 0)
);
