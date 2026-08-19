-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('silva', 'spx', 'vendor');

-- CreateEnum
CREATE TYPE "AfeBand" AS ENUM ('A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "AfpStatus" AS ENUM ('draft', 'submitted', 'approved', 'active', 'closed');

-- CreateEnum
CREATE TYPE "AfeStatus" AS ENUM ('draft', 'submitted', 'validated', 'approved', 'active', 'closed', 'rejected');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('draft', 'issued', 'in_progress', 'complete', 'closed');

-- CreateEnum
CREATE TYPE "WorkOrderTier" AS ENUM ('retainer', 'project', 'special');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('draft', 'open', 'in_progress', 'complete', 'cancelled');

-- CreateEnum
CREATE TYPE "FieldTicketStatus" AS ENUM ('draft', 'submitted', 'vendor_reviewed', 'validated', 'rejected');

-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('draft', 'submitted', 'verified', 'rejected', 'settled');

-- CreateEnum
CREATE TYPE "PaymentRequestType" AS ENUM ('bagro_fee', 'reimbursable_cost', 'vendor_fee');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('draft', 'authorized', 'settled');

-- CreateEnum
CREATE TYPE "SettlementType" AS ENUM ('bagro_fee', 'labor_wages', 'vendor_payment');

-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('active', 'pending', 'expired', 'terminated');

-- CreateEnum
CREATE TYPE "ProcurementRoute" AS ENUM ('sole_source', 'competitive_tender');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('n_a', 'in_progress', 'awarded');

-- CreateEnum
CREATE TYPE "RevenueTier" AS ENUM ('retainer', 'project', 'special');

-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('invoiced', 'paid', 'overdue');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('weekly', 'monthly', 'quarterly', 'annual');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('draft', 'in_review', 'released');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "GlExportStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "isDefaultExecutionPartner" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'pending',
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restricted_export_credentials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restricted_export_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "servicesProvided" TEXT NOT NULL DEFAULT '',
    "prequalified" BOOLEAN NOT NULL DEFAULT false,
    "insuranceOnFile" BOOLEAN NOT NULL DEFAULT false,
    "insuranceExpiry" TIMESTAMP(3),
    "status" "VendorStatus" NOT NULL DEFAULT 'pending',
    "isDefaultExecutionPartner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afp_lines" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "operatingDiscipline" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "budgetAllocatedUsd" DECIMAL(14,2) NOT NULL,
    "kpiTarget" TEXT NOT NULL,
    "status" "AfpStatus" NOT NULL DEFAULT 'draft',
    "silvaApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvalDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "afp_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afes" (
    "id" TEXT NOT NULL,
    "afpLineId" TEXT NOT NULL,
    "operatingDiscipline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedCostUsd" DECIMAL(14,2) NOT NULL,
    "band" "AfeBand" NOT NULL,
    "spxValidated" BOOLEAN NOT NULL DEFAULT false,
    "silvaApprovalRequired" BOOLEAN NOT NULL,
    "silvaApproved" BOOLEAN,
    "approvalDate" TIMESTAMP(3),
    "status" "AfeStatus" NOT NULL DEFAULT 'draft',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "afes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "afeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "tier" "WorkOrderTier" NOT NULL,
    "weekStart" INTEGER NOT NULL,
    "weekEnd" INTEGER NOT NULL,
    "spxOversightHoursL1" INTEGER NOT NULL DEFAULT 0,
    "spxOversightHoursL2" INTEGER NOT NULL DEFAULT 0,
    "spxOversightHoursL3" INTEGER NOT NULL DEFAULT 0,
    "assignedVendorId" TEXT,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_assignments" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleOnOrder" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_tasks" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "assigneeUserId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "dueDate" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_order_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_tickets" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "activityRecorded" TEXT NOT NULL,
    "areaHa" DECIMAL(10,2) NOT NULL,
    "laborCount" INTEGER NOT NULL,
    "materialsUsed" TEXT NOT NULL DEFAULT '',
    "ticketDate" TIMESTAMP(3) NOT NULL,
    "signedOff" BOOLEAN NOT NULL DEFAULT false,
    "signedOffByUserId" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "status" "FieldTicketStatus" NOT NULL DEFAULT 'draft',
    "paymentRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "fieldTicketId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "type" "PaymentRequestType" NOT NULL,
    "amountRequestedEtb" DECIMAL(14,2) NOT NULL,
    "dateSubmitted" TIMESTAMP(3),
    "spxVerified" BOOLEAN NOT NULL DEFAULT false,
    "spxVerifiedByUserId" TEXT,
    "verifiedDate" TIMESTAMP(3),
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'draft',
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_settlements" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "paymentRequestId" TEXT NOT NULL,
    "type" "SettlementType" NOT NULL,
    "payee" TEXT NOT NULL,
    "amountEtb" DECIMAL(14,2) NOT NULL,
    "spxAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "authorizedByUserId" TEXT,
    "dateAuthorized" TIMESTAMP(3),
    "status" "SettlementStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contracts" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "afeId" TEXT NOT NULL,
    "contractValueUsd" DECIMAL(14,2) NOT NULL,
    "procurementRoute" "ProcurementRoute" NOT NULL,
    "tenderStatus" "TenderStatus" NOT NULL DEFAULT 'n_a',
    "contractStart" TIMESTAMP(3) NOT NULL,
    "contractEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_scorecards" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "reviewPeriod" TEXT NOT NULL,
    "qualityScore" INTEGER NOT NULL,
    "timelinessScore" INTEGER NOT NULL,
    "costAdherenceScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "reviewedByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spx_revenue_ledger" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "tier" "RevenueTier" NOT NULL,
    "feeDescription" TEXT NOT NULL,
    "amountEtb" DECIMAL(14,2) NOT NULL,
    "amountUsd" DECIMAL(14,2) NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "paymentStatus" "InvoicePaymentStatus" NOT NULL DEFAULT 'invoiced',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spx_revenue_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coa_mapping" (
    "id" TEXT NOT NULL,
    "sourceAccount" TEXT NOT NULL,
    "glAccount" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "coa_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gl_journal_exports" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "GlExportStatus" NOT NULL DEFAULT 'pending',
    "restrictedAccessTokenIssued" BOOLEAN NOT NULL DEFAULT false,
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gl_journal_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gl_journal_export_lines" (
    "id" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "account" TEXT NOT NULL,
    "debitEtb" DECIMAL(14,2) NOT NULL,
    "creditEtb" DECIMAL(14,2) NOT NULL,
    "memo" TEXT NOT NULL,

    CONSTRAINT "gl_journal_export_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule3_thresholds" (
    "band" "AfeBand" NOT NULL,
    "minValueUsd" DECIMAL(14,2) NOT NULL,
    "maxValueUsd" DECIMAL(14,2),
    "spxAuthority" TEXT NOT NULL,
    "silvaAuthority" TEXT NOT NULL,
    "effectiveYear" INTEGER NOT NULL,

    CONSTRAINT "schedule3_thresholds_pkey" PRIMARY KEY ("band")
);

-- CreateTable
CREATE TABLE "schedule4_insurance" (
    "id" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "coverageType" TEXT NOT NULL,
    "minimumCoverageUsd" DECIMAL(14,2) NOT NULL,
    "beneficiary" TEXT NOT NULL,

    CONSTRAINT "schedule4_insurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountability_matrix" (
    "operatingDiscipline" TEXT NOT NULL,
    "executeRole" TEXT NOT NULL,
    "validateRole" TEXT NOT NULL,
    "decideRole" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "schedule3Ref" TEXT NOT NULL,

    CONSTRAINT "accountability_matrix_pkey" PRIMARY KEY ("operatingDiscipline")
);

-- CreateTable
CREATE TABLE "related_party_disclosures" (
    "id" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "related_party_disclosures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "fxRateEtbPerUsd" DECIMAL(10,4) NOT NULL,
    "enhancedGovernanceActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_kpi_snapshots" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "pickerProductivityCurrent" DECIMAL(10,2) NOT NULL,
    "yieldTrendVsBaselinePercent" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_kpi_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "period" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'draft',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "narrative" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releasedByUserId" TEXT,
    "visibleToSilva" BOOLEAN NOT NULL DEFAULT false,
    "sections" JSONB,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "recipientRole" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "id_sequences" (
    "name" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "id_sequences_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_userId_organizationId_key" ON "organization_memberships"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_tokenHash_key" ON "refresh_sessions"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "restricted_export_credentials_tokenHash_key" ON "restricted_export_credentials"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_organizationId_key" ON "vendors"("organizationId");

-- CreateIndex
CREATE INDEX "afp_lines_year_status_idx" ON "afp_lines"("year", "status");

-- CreateIndex
CREATE INDEX "afes_status_band_idx" ON "afes"("status", "band");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_scorecards_vendorId_reviewPeriod_key" ON "vendor_scorecards"("vendorId", "reviewPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "harvest_kpi_snapshots_year_key" ON "harvest_kpi_snapshots"("year");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afp_lines" ADD CONSTRAINT "afp_lines_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afes" ADD CONSTRAINT "afes_afpLineId_fkey" FOREIGN KEY ("afpLineId") REFERENCES "afp_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afes" ADD CONSTRAINT "afes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_afeId_fkey" FOREIGN KEY ("afeId") REFERENCES "afes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignedVendorId_fkey" FOREIGN KEY ("assignedVendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_tickets" ADD CONSTRAINT "field_tickets_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_tickets" ADD CONSTRAINT "field_tickets_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_tickets" ADD CONSTRAINT "field_tickets_signedOffByUserId_fkey" FOREIGN KEY ("signedOffByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_fieldTicketId_fkey" FOREIGN KEY ("fieldTicketId") REFERENCES "field_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_spxVerifiedByUserId_fkey" FOREIGN KEY ("spxVerifiedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "payment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_settlements" ADD CONSTRAINT "owner_settlements_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_contracts" ADD CONSTRAINT "vendor_contracts_afeId_fkey" FOREIGN KEY ("afeId") REFERENCES "afes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_scorecards" ADD CONSTRAINT "vendor_scorecards_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_scorecards" ADD CONSTRAINT "vendor_scorecards_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gl_journal_export_lines" ADD CONSTRAINT "gl_journal_export_lines_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "gl_journal_exports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_releasedByUserId_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

