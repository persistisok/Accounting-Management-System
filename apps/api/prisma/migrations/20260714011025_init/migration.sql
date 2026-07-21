-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PM', 'FINANCE', 'COMPLIANCE', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrganizationRoleType" AS ENUM ('SUPPORTER', 'EXECUTOR');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SelectionStatus" AS ENUM ('CANDIDATE', 'SELECTED', 'NOT_SELECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ContractDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('SUPPORT', 'EXECUTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SIGNED', 'TERMINATED', 'VOID');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('UNMATCHED', 'PARTIAL', 'MATCHED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('MANUAL', 'EXCEL', 'BANK_FILE');

-- CreateEnum
CREATE TYPE "AllocationCategory" AS ENUM ('SUPPORT_RECEIPT', 'EXECUTION_PAYMENT', 'EXPERT_FEE', 'MEMBER_DUE', 'OTHER');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REVERSED');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('BLUE', 'RED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('NORMAL', 'VOID');

-- CreateEnum
CREATE TYPE "DueStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'WAIVED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "department" VARCHAR(100),
    "role" "UserRole" NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "project_code" VARCHAR(32) NOT NULL,
    "platform" VARCHAR(100) NOT NULL,
    "published_on" DATE NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "nature" VARCHAR(50) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "approved_amount" DECIMAL(18,2) NOT NULL,
    "execution_budget" DECIMAL(18,2) NOT NULL,
    "pm_user_id" UUID NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "remark" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "organization_code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "normalized_name" VARCHAR(200) NOT NULL,
    "credit_code" VARCHAR(32),
    "platform" VARCHAR(100) NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "contact_name" VARCHAR(100),
    "contact_phone" VARCHAR(30),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role_type" "OrganizationRoleType" NOT NULL,
    "joined_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'APPROVED',

    CONSTRAINT "organization_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_executor_candidates" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "selection_status" "SelectionStatus" NOT NULL DEFAULT 'CANDIDATE',
    "selected_on" DATE,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_executor_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "contract_no" VARCHAR(64) NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_direction" "ContractDirection" NOT NULL,
    "contract_type" "ContractType" NOT NULL,
    "contract_entity" VARCHAR(200) NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "signed_on" DATE NOT NULL,
    "effective_on" DATE,
    "expires_on" DATE,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "parent_contract_id" UUID,
    "remark" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "account_name" VARCHAR(200) NOT NULL,
    "bank_name" VARCHAR(200) NOT NULL,
    "account_number_encrypted" TEXT NOT NULL,
    "account_number_masked" VARCHAR(64) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "transaction_no" VARCHAR(100),
    "transaction_at" TIMESTAMP(3) NOT NULL,
    "counterparty_name" VARCHAR(200) NOT NULL,
    "counterparty_account_masked" VARCHAR(64),
    "direction" "TransactionDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "nature" VARCHAR(100) NOT NULL,
    "settlement_applicable" BOOLEAN NOT NULL DEFAULT true,
    "match_status" "MatchStatus" NOT NULL DEFAULT 'UNMATCHED',
    "source_type" "SourceType" NOT NULL DEFAULT 'MANUAL',
    "source_row_hash" VARCHAR(64),
    "raw_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_allocations" (
    "id" UUID NOT NULL,
    "bank_transaction_id" UUID NOT NULL,
    "project_id" UUID,
    "member_due_id" UUID,
    "expert_profile_id" UUID,
    "category" "AllocationCategory" NOT NULL,
    "allocated_amount" DECIMAL(18,2) NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "invoice_code" VARCHAR(32),
    "invoice_number" VARCHAR(64) NOT NULL,
    "project_id" UUID NOT NULL,
    "issued_on" DATE NOT NULL,
    "invoice_type" VARCHAR(30) NOT NULL,
    "invoice_platform" VARCHAR(100) NOT NULL,
    "buyer_name" VARCHAR(200) NOT NULL,
    "amount_excluding_tax" DECIMAL(18,2) NOT NULL,
    "tax_rate" DECIMAL(8,6) NOT NULL,
    "tax_amount" DECIMAL(18,2) NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "kind" "InvoiceKind" NOT NULL DEFAULT 'BLUE',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'NORMAL',
    "original_invoice_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "phone_encrypted" TEXT,
    "phone_masked" VARCHAR(30),
    "id_number_encrypted" TEXT,
    "id_number_hash" VARCHAR(64),
    "id_number_masked" VARCHAR(32),
    "email" VARCHAR(200),
    "organization_name" VARCHAR(200),
    "department" VARCHAR(100),
    "position" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expert_profiles" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "professional_title" VARCHAR(100),
    "bank_name" VARCHAR(200),
    "bank_account_encrypted" TEXT,
    "bank_account_masked" VARCHAR(64),
    "joined_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "form_owner_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expert_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committees" (
    "id" UUID NOT NULL,
    "committee_code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "established_on" DATE NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "committees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "member_name" VARCHAR(200) NOT NULL,
    "committee_id" UUID NOT NULL,
    "member_type" VARCHAR(50) NOT NULL,
    "pm_user_id" UUID NOT NULL,
    "joined_on" DATE,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_dues" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "due_code" VARCHAR(32) NOT NULL,
    "period_label" VARCHAR(50),
    "amount_due" DECIMAL(18,2) NOT NULL,
    "due_on" DATE,
    "status" "DueStatus" NOT NULL DEFAULT 'UNPAID',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_dues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "object_type" VARCHAR(30) NOT NULL,
    "object_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(30) NOT NULL,
    "object_type" VARCHAR(50) NOT NULL,
    "object_id" UUID NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "request_id" VARCHAR(64),
    "ip_address" VARCHAR(64),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_code_key" ON "projects"("project_code");

-- CreateIndex
CREATE INDEX "projects_pm_user_id_status_idx" ON "projects"("pm_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_organization_code_key" ON "organizations"("organization_code");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_credit_code_key" ON "organizations"("credit_code");

-- CreateIndex
CREATE INDEX "organizations_normalized_name_idx" ON "organizations"("normalized_name");

-- CreateIndex
CREATE INDEX "organization_roles_role_type_review_status_idx" ON "organization_roles"("role_type", "review_status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_roles_organization_id_role_type_key" ON "organization_roles"("organization_id", "role_type");

-- CreateIndex
CREATE UNIQUE INDEX "project_executor_candidates_project_id_organization_id_key" ON "project_executor_candidates"("project_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_contract_no_key" ON "contracts"("contract_no");

-- CreateIndex
CREATE INDEX "contracts_project_id_status_contract_type_idx" ON "contracts"("project_id", "status", "contract_type");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_source_row_hash_key" ON "bank_transactions"("source_row_hash");

-- CreateIndex
CREATE INDEX "bank_transactions_transaction_at_direction_match_status_idx" ON "bank_transactions"("transaction_at", "direction", "match_status");

-- CreateIndex
CREATE INDEX "bank_allocations_project_id_category_status_idx" ON "bank_allocations"("project_id", "category", "status");

-- CreateIndex
CREATE INDEX "invoices_project_id_status_issued_on_idx" ON "invoices"("project_id", "status", "issued_on");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_code_invoice_number_key" ON "invoices"("invoice_code", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "persons_id_number_hash_key" ON "persons"("id_number_hash");

-- CreateIndex
CREATE INDEX "persons_name_idx" ON "persons"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expert_profiles_person_id_key" ON "expert_profiles"("person_id");

-- CreateIndex
CREATE INDEX "expert_profiles_review_status_joined_on_idx" ON "expert_profiles"("review_status", "joined_on");

-- CreateIndex
CREATE UNIQUE INDEX "committees_committee_code_key" ON "committees"("committee_code");

-- CreateIndex
CREATE INDEX "memberships_committee_id_member_name_idx" ON "memberships"("committee_id", "member_name");

-- CreateIndex
CREATE UNIQUE INDEX "member_dues_due_code_key" ON "member_dues"("due_code");

-- CreateIndex
CREATE INDEX "member_dues_membership_id_status_idx" ON "member_dues"("membership_id", "status");

-- CreateIndex
CREATE INDEX "attachments_object_type_object_id_idx" ON "attachments"("object_type", "object_id");

-- CreateIndex
CREATE INDEX "audit_logs_object_type_object_id_occurred_at_idx" ON "audit_logs"("object_type", "object_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_occurred_at_idx" ON "audit_logs"("actor_user_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_pm_user_id_fkey" FOREIGN KEY ("pm_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_roles" ADD CONSTRAINT "organization_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_executor_candidates" ADD CONSTRAINT "project_executor_candidates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_executor_candidates" ADD CONSTRAINT "project_executor_candidates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_parent_contract_id_fkey" FOREIGN KEY ("parent_contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_allocations" ADD CONSTRAINT "bank_allocations_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_allocations" ADD CONSTRAINT "bank_allocations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_allocations" ADD CONSTRAINT "bank_allocations_member_due_id_fkey" FOREIGN KEY ("member_due_id") REFERENCES "member_dues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_allocations" ADD CONSTRAINT "bank_allocations_expert_profile_id_fkey" FOREIGN KEY ("expert_profile_id") REFERENCES "expert_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_original_invoice_id_fkey" FOREIGN KEY ("original_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_form_owner_id_fkey" FOREIGN KEY ("form_owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expert_profiles" ADD CONSTRAINT "expert_profiles_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committees" ADD CONSTRAINT "committees_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_pm_user_id_fkey" FOREIGN KEY ("pm_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_dues" ADD CONSTRAINT "member_dues_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
