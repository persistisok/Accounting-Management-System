ALTER TABLE "organizations"
  ADD COLUMN "executor_other_capability_note" VARCHAR(200);

CREATE TABLE "service_capabilities" (
  "id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "normalized_name" VARCHAR(100) NOT NULL,
  "is_other" BOOLEAN NOT NULL DEFAULT false,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "executor_service_capabilities" (
  "organization_id" UUID NOT NULL,
  "capability_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "executor_service_capabilities_pkey" PRIMARY KEY ("organization_id", "capability_id")
);

CREATE UNIQUE INDEX "service_capabilities_normalized_name_key"
  ON "service_capabilities"("normalized_name");
CREATE INDEX "service_capabilities_status_sort_order_idx"
  ON "service_capabilities"("status", "sort_order");
CREATE INDEX "executor_service_capabilities_capability_id_idx"
  ON "executor_service_capabilities"("capability_id");

ALTER TABLE "executor_service_capabilities"
  ADD CONSTRAINT "executor_service_capabilities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "executor_service_capabilities"
  ADD CONSTRAINT "executor_service_capabilities_capability_id_fkey"
  FOREIGN KEY ("capability_id") REFERENCES "service_capabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "service_capabilities" ("id", "name", "normalized_name", "is_other", "sort_order", "updated_at") VALUES
  ('10000000-0000-4000-8000-000000000001', '摄影摄像', '摄影摄像', false, 10, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000002', '舞台搭建', '舞台搭建', false, 20, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000003', '灯光音响', '灯光音响', false, 30, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000004', '礼仪主持', '礼仪主持', false, 40, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000005', '同声传译', '同声传译', false, 50, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000006', '速记服务', '速记服务', false, 60, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000007', '物料设计与制作', '物料设计与制作', false, 70, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000008', '餐饮茶歇', '餐饮茶歇', false, 80, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000009', '交通接送', '交通接送', false, 90, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000010', '现场直播', '现场直播', false, 100, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000011', '场地供应与住宿', '场地供应与住宿', false, 110, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000012', '其他', '其他', true, 120, CURRENT_TIMESTAMP);
