-- Work plan submissions, AFP line schedules, farm blocks, field ticket extensions

CREATE TYPE "WorkPlanSubmissionStatus" AS ENUM ('draft', 'submitted', 'revision_requested', 'accepted', 'rejected');
CREATE TYPE "FieldTicketType" AS ENUM ('field_execution', 'payroll_confirmation');

CREATE TABLE "work_plan_submissions" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "budgetYearLabel" TEXT NOT NULL,
    "budgetYearGc" INTEGER NOT NULL,
    "status" "WorkPlanSubmissionStatus" NOT NULL DEFAULT 'draft',
    "fxEtbPerUsd" DECIMAL(10,2) NOT NULL,
    "parsedJson" JSONB,
    "sourceAttachmentId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNotes" TEXT,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_plan_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "afp_line_schedules" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "afpLineId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "plannedCostEtb" DECIMAL(14,2) NOT NULL,
    "plannedCostUsd" DECIMAL(14,2),

    CONSTRAINT "afp_line_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "farm_blocks" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "areaHa" DECIMAL(10,2),
    "treeCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_order_block_assignments" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "userId" TEXT,
    "roleOnBlock" TEXT NOT NULL DEFAULT 'manager',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_block_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "afp_lines" ADD COLUMN "budgetAllocatedEtb" DECIMAL(14,2);
ALTER TABLE "afp_lines" ADD COLUMN "workPlanSubmissionId" TEXT;

ALTER TABLE "field_tickets" ADD COLUMN "activityCatalogId" TEXT;
ALTER TABLE "field_tickets" ADD COLUMN "ticketType" "FieldTicketType" NOT NULL DEFAULT 'field_execution';
ALTER TABLE "field_tickets" ADD COLUMN "actualQuantity" DECIMAL(14,2);
ALTER TABLE "field_tickets" ADD COLUMN "actualMandays" DECIMAL(14,2);
ALTER TABLE "field_tickets" ADD COLUMN "actualCostEtb" DECIMAL(14,2);
ALTER TABLE "field_tickets" ADD COLUMN "normValidationJson" JSONB;

CREATE INDEX "work_plan_submissions_programId_status_idx" ON "work_plan_submissions"("programId", "status");
CREATE INDEX "work_plan_submissions_vendorId_budgetYearGc_idx" ON "work_plan_submissions"("vendorId", "budgetYearGc");
CREATE UNIQUE INDEX "afp_line_schedules_afpLineId_year_month_key" ON "afp_line_schedules"("afpLineId", "year", "month");
CREATE INDEX "afp_line_schedules_programId_year_month_idx" ON "afp_line_schedules"("programId", "year", "month");
CREATE UNIQUE INDEX "farm_blocks_programId_code_key" ON "farm_blocks"("programId", "code");
CREATE INDEX "farm_blocks_programId_idx" ON "farm_blocks"("programId");
CREATE UNIQUE INDEX "work_order_block_assignments_workOrderId_blockId_key" ON "work_order_block_assignments"("workOrderId", "blockId");
CREATE INDEX "work_order_block_assignments_blockId_idx" ON "work_order_block_assignments"("blockId");
CREATE INDEX "afp_lines_workPlanSubmissionId_idx" ON "afp_lines"("workPlanSubmissionId");
CREATE INDEX "field_tickets_activityCatalogId_idx" ON "field_tickets"("activityCatalogId");

ALTER TABLE "work_plan_submissions" ADD CONSTRAINT "work_plan_submissions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_plan_submissions" ADD CONSTRAINT "work_plan_submissions_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_plan_submissions" ADD CONSTRAINT "work_plan_submissions_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_plan_submissions" ADD CONSTRAINT "work_plan_submissions_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "afp_line_schedules" ADD CONSTRAINT "afp_line_schedules_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "afp_line_schedules" ADD CONSTRAINT "afp_line_schedules_afpLineId_fkey" FOREIGN KEY ("afpLineId") REFERENCES "afp_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "afp_lines" ADD CONSTRAINT "afp_lines_workPlanSubmissionId_fkey" FOREIGN KEY ("workPlanSubmissionId") REFERENCES "work_plan_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "farm_blocks" ADD CONSTRAINT "farm_blocks_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_order_block_assignments" ADD CONSTRAINT "work_order_block_assignments_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_order_block_assignments" ADD CONSTRAINT "work_order_block_assignments_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "farm_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_order_block_assignments" ADD CONSTRAINT "work_order_block_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "field_tickets" ADD CONSTRAINT "field_tickets_activityCatalogId_fkey" FOREIGN KEY ("activityCatalogId") REFERENCES "activity_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
