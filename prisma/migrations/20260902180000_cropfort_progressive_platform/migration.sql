-- Cropfort progressive platform: per-farm tenancy + workflow stages

-- New enums
DO $$ BEGIN
  CREATE TYPE "FarmBlockStatus" AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FarmWorkflowStageKey" AS ENUM (
    'farm_block_setup', 'benchmark_survey', 'rate_cards_confirmed', 'fee_schedule_set',
    'tier_election', 'activity_plan', 'master_plan_calendar', 'supervisor_progress',
    'budgets_cash_flow', 'monthly_client_report'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupervisorPctComplete" AS ENUM ('pct_0', 'pct_25', 'pct_50', 'pct_75', 'pct_100');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MonthlyReportStatus" AS ENUM ('draft', 'ready', 'sent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extend CropfortRole enum
ALTER TYPE "CropfortRole" ADD VALUE IF NOT EXISTS 'field_manager';
ALTER TYPE "CropfortRole" ADD VALUE IF NOT EXISTS 'farm_owner_viewer';

-- farm_estates extensions
ALTER TABLE "farm_estates"
  ADD COLUMN IF NOT EXISTS "termStartDate" DATE,
  ADD COLUMN IF NOT EXISTS "approverUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "fieldManagerUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "coreBundleElected" BOOLEAN;

CREATE INDEX IF NOT EXISTS "farm_estates_approverUserId_idx" ON "farm_estates"("approverUserId");

ALTER TABLE "farm_estates"
  DROP CONSTRAINT IF EXISTS "farm_estates_approverUserId_fkey";
ALTER TABLE "farm_estates"
  ADD CONSTRAINT "farm_estates_approverUserId_fkey"
  FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "farm_estates"
  DROP CONSTRAINT IF EXISTS "farm_estates_fieldManagerUserId_fkey";
ALTER TABLE "farm_estates"
  ADD CONSTRAINT "farm_estates_fieldManagerUserId_fkey"
  FOREIGN KEY ("fieldManagerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- farm_blocks extensions
ALTER TABLE "farm_blocks"
  ADD COLUMN IF NOT EXISTS "varietyPlanted" TEXT,
  ADD COLUMN IF NOT EXISTS "plantingDate" DATE,
  ADD COLUMN IF NOT EXISTS "status" "FarmBlockStatus" NOT NULL DEFAULT 'active';

-- rate_card_lines per-farm
ALTER TABLE "rate_card_lines"
  ADD COLUMN IF NOT EXISTS "farmEstateId" TEXT;

CREATE INDEX IF NOT EXISTS "rate_card_lines_farmEstateId_status_idx"
  ON "rate_card_lines"("farmEstateId", "status");

ALTER TABLE "rate_card_lines"
  DROP CONSTRAINT IF EXISTS "rate_card_lines_farmEstateId_fkey";
ALTER TABLE "rate_card_lines"
  ADD CONSTRAINT "rate_card_lines_farmEstateId_fkey"
  FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- farm_workflow_stages
CREATE TABLE IF NOT EXISTS "farm_workflow_stages" (
  "id" TEXT NOT NULL,
  "farmEstateId" TEXT NOT NULL,
  "stageKey" "FarmWorkflowStageKey" NOT NULL,
  "completedAt" TIMESTAMP(3),
  "completedByUserId" TEXT,
  "gateSnapshotJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "farm_workflow_stages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "farm_workflow_stages_farmEstateId_stageKey_key"
  ON "farm_workflow_stages"("farmEstateId", "stageKey");
CREATE INDEX IF NOT EXISTS "farm_workflow_stages_farmEstateId_idx"
  ON "farm_workflow_stages"("farmEstateId");

ALTER TABLE "farm_workflow_stages"
  DROP CONSTRAINT IF EXISTS "farm_workflow_stages_farmEstateId_fkey";
ALTER TABLE "farm_workflow_stages"
  ADD CONSTRAINT "farm_workflow_stages_farmEstateId_fkey"
  FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "farm_workflow_stages"
  DROP CONSTRAINT IF EXISTS "farm_workflow_stages_completedByUserId_fkey";
ALTER TABLE "farm_workflow_stages"
  ADD CONSTRAINT "farm_workflow_stages_completedByUserId_fkey"
  FOREIGN KEY ("completedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- benchmark_surveys
CREATE TABLE IF NOT EXISTS "benchmark_surveys" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "farmEstateId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "neighbor1Name" TEXT,
  "neighbor2Name" TEXT,
  "neighbor1Rate" DECIMAL(14,2),
  "neighbor2Rate" DECIMAL(14,2),
  "lockedAt" TIMESTAMP(3),
  "recommendedRate" DECIMAL(14,2),
  "proposedRate" DECIMAL(14,2),
  "useNormWage" BOOLEAN NOT NULL DEFAULT false,
  "status" "CropfortLineStatus" NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "supersedesId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "approverUserId" TEXT,
  "returnedComment" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "benchmark_surveys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "benchmark_surveys_farmEstateId_activityId_status_idx"
  ON "benchmark_surveys"("farmEstateId", "activityId", "status");

-- labor_rate_cards
CREATE TABLE IF NOT EXISTS "labor_rate_cards" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "farmEstateId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "normMandayPerUnit" DECIMAL(14,4),
  "wageRatePerManday" DECIMAL(14,2),
  "status" "CropfortLineStatus" NOT NULL DEFAULT 'approved',
  "version" INTEGER NOT NULL DEFAULT 1,
  "supersedesId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "labor_rate_cards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "labor_rate_cards_farmEstateId_activityId_idx"
  ON "labor_rate_cards"("farmEstateId", "activityId");

-- cropfort_elections
CREATE TABLE IF NOT EXISTS "cropfort_elections" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "farmEstateId" TEXT NOT NULL,
  "planYear" INTEGER NOT NULL,
  "blockId" TEXT,
  "activityId" TEXT NOT NULL,
  "electionOverride" BOOLEAN,
  "commercialAgreementRef" TEXT,
  "defaultWindowStart" DATE,
  "defaultWindowEnd" DATE,
  "plannedDurationDays" INTEGER,
  "effectiveEndDate" DATE,
  "status" "CropfortLineStatus" NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "supersedesId" TEXT,
  "returnedComment" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_elections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cropfort_elections_farmEstateId_planYear_blockId_idx"
  ON "cropfort_elections"("farmEstateId", "planYear", "blockId");

-- cropfort_activity_plans
CREATE TABLE IF NOT EXISTS "cropfort_activity_plans" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "farmEstateId" TEXT NOT NULL,
  "planYear" INTEGER NOT NULL,
  "blockId" TEXT,
  "activityId" TEXT NOT NULL,
  "electionId" TEXT,
  "plannedQty" DECIMAL(14,4),
  "resolvedLaborRate" DECIMAL(14,2),
  "plannedLaborCost" DECIMAL(14,2),
  "plannedMaterialCost" DECIMAL(14,2),
  "plannedServiceCost" DECIMAL(14,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_activity_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cropfort_activity_plans_farmEstateId_planYear_blockId_idx"
  ON "cropfort_activity_plans"("farmEstateId", "planYear", "blockId");

-- fee_schedules + lines
CREATE TABLE IF NOT EXISTS "fee_schedules" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "farmEstateId" TEXT NOT NULL,
  "confirmedAnnualFee" DECIMAL(14,2) NOT NULL,
  "status" "CropfortLineStatus" NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "supersedesId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "returnedComment" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fee_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "fee_schedule_lines" (
  "id" TEXT NOT NULL,
  "feeScheduleId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "annualFee" DECIMAL(14,2),
  "activationMonth" INTEGER,
  "deferred" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fee_schedule_lines_pkey" PRIMARY KEY ("id")
);

-- supervisor_progress
CREATE TABLE IF NOT EXISTS "supervisor_progress" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "activityPlanId" TEXT NOT NULL,
  "pctComplete" "SupervisorPctComplete" NOT NULL DEFAULT 'pct_0',
  "lastMovementDate" DATE,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supervisor_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "supervisor_progress_activityPlanId_key"
  ON "supervisor_progress"("activityPlanId");

-- monthly_client_reports
CREATE TABLE IF NOT EXISTS "monthly_client_reports" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "farmEstateId" TEXT NOT NULL,
  "reportMonth" DATE NOT NULL,
  "fieldObservations" TEXT,
  "lookAheadNotes" TEXT,
  "status" "MonthlyReportStatus" NOT NULL DEFAULT 'draft',
  "sentAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "monthly_client_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "monthly_client_reports_farmEstateId_reportMonth_key"
  ON "monthly_client_reports"("farmEstateId", "reportMonth");
