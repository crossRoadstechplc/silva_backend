-- Idempotent additive migration for activity requests / ad-hoc AFE fields

DO $$ BEGIN
  CREATE TYPE "ActivityRequestType" AS ENUM (
    'coffee_testing',
    'farm_status_assessment',
    'soil_analysis',
    'quality_audit',
    'infrastructure_inspection',
    'urgent_field_work',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill labels if an earlier partial CREATE TYPE left the enum incomplete
ALTER TYPE "ActivityRequestType" ADD VALUE IF NOT EXISTS 'urgent_field_work';
ALTER TYPE "ActivityRequestType" ADD VALUE IF NOT EXISTS 'other';

DO $$ BEGIN
  CREATE TYPE "ActivityRequestStatus" AS ENUM ('submitted', 'converted', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ActivityRequestOrigin" AS ENUM ('silva_request', 'vendor_request');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ActivityRequestUrgency" AS ENUM ('normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AfePlanningMode" AS ENUM ('planned', 'ad_hoc');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AfeOrigin" AS ENUM ('spx_initiated', 'silva_request', 'vendor_request');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "afes" ADD COLUMN IF NOT EXISTS "planningMode" "AfePlanningMode" NOT NULL DEFAULT 'planned';
ALTER TABLE "afes" ADD COLUMN IF NOT EXISTS "origin" "AfeOrigin" NOT NULL DEFAULT 'spx_initiated';
ALTER TABLE "afes" ADD COLUMN IF NOT EXISTS "activityRequestId" TEXT;
ALTER TABLE "afes" ALTER COLUMN "afpLineId" DROP NOT NULL;

ALTER TABLE "farm_estates" ADD COLUMN IF NOT EXISTS "demoTempC" DECIMAL(5,2);
ALTER TABLE "farm_estates" ADD COLUMN IF NOT EXISTS "demoHumidityPct" DECIMAL(5,2);
ALTER TABLE "farm_estates" ADD COLUMN IF NOT EXISTS "demoRainfallMm" DECIMAL(8,2);

-- Drop incomplete table from a failed partial apply (empty / wrong shape)
DROP TABLE IF EXISTS "activity_requests" CASCADE;

CREATE TABLE "activity_requests" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "farmEstateId" TEXT,
    "requestType" "ActivityRequestType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "urgency" "ActivityRequestUrgency" NOT NULL DEFAULT 'normal',
    "blocksOrAreas" TEXT,
    "blockCode" TEXT,
    "status" "ActivityRequestStatus" NOT NULL DEFAULT 'submitted',
    "origin" "ActivityRequestOrigin" NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "vendorId" TEXT,
    "activityCatalogId" TEXT,
    "workPlanSubmissionId" TEXT,
    "suggestedAfpLineId" TEXT,
    "convertedAfeId" TEXT,
    "dismissalReason" TEXT,
    "convertedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "afes_activityRequestId_key" ON "afes"("activityRequestId");
CREATE INDEX IF NOT EXISTS "afes_planningMode_origin_idx" ON "afes"("planningMode", "origin");
CREATE INDEX IF NOT EXISTS "activity_requests_programId_status_idx" ON "activity_requests"("programId", "status");
CREATE INDEX IF NOT EXISTS "activity_requests_origin_status_idx" ON "activity_requests"("origin", "status");
CREATE INDEX IF NOT EXISTS "activity_requests_requestedByUserId_idx" ON "activity_requests"("requestedByUserId");
CREATE INDEX IF NOT EXISTS "activity_requests_vendorId_idx" ON "activity_requests"("vendorId");

DO $$ BEGIN
  ALTER TABLE "activity_requests" ADD CONSTRAINT "activity_requests_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "activity_requests" ADD CONSTRAINT "activity_requests_farmEstateId_fkey"
    FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "activity_requests" ADD CONSTRAINT "activity_requests_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "activity_requests" ADD CONSTRAINT "activity_requests_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "activity_requests" ADD CONSTRAINT "activity_requests_activityCatalogId_fkey"
    FOREIGN KEY ("activityCatalogId") REFERENCES "activity_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "activity_requests" ADD CONSTRAINT "activity_requests_workPlanSubmissionId_fkey"
    FOREIGN KEY ("workPlanSubmissionId") REFERENCES "work_plan_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "activity_requests" ADD CONSTRAINT "activity_requests_suggestedAfpLineId_fkey"
    FOREIGN KEY ("suggestedAfpLineId") REFERENCES "afp_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "afes" ADD CONSTRAINT "afes_activityRequestId_fkey"
    FOREIGN KEY ("activityRequestId") REFERENCES "activity_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
