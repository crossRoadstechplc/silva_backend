-- Operating Model v2: activity requests, AFE planning mode, IFS vendor review, report curation

CREATE TYPE "AfePlanningMode" AS ENUM ('planned', 'ad_hoc');
CREATE TYPE "AfeOrigin" AS ENUM ('spx_initiated', 'silva_request', 'vendor_request');
CREATE TYPE "ActivityRequestType" AS ENUM (
  'coffee_testing',
  'farm_status_assessment',
  'soil_analysis',
  'quality_audit',
  'infrastructure_inspection'
);
CREATE TYPE "ActivityRequestStatus" AS ENUM ('submitted', 'converted', 'dismissed');
CREATE TYPE "ActivityRequestOrigin" AS ENUM ('silva_request', 'vendor_request');

ALTER TYPE "IfsFormStatus" ADD VALUE IF NOT EXISTS 'vendor_reviewed';

ALTER TABLE "afes" ADD COLUMN IF NOT EXISTS "planningMode" "AfePlanningMode" NOT NULL DEFAULT 'planned';
ALTER TABLE "afes" ADD COLUMN IF NOT EXISTS "origin" "AfeOrigin" NOT NULL DEFAULT 'spx_initiated';
ALTER TABLE "afes" ADD COLUMN IF NOT EXISTS "activityRequestId" TEXT;

ALTER TABLE "afes" ALTER COLUMN "afpLineId" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "afes_activityRequestId_key" ON "afes"("activityRequestId");
CREATE INDEX IF NOT EXISTS "afes_programId_planningMode_idx" ON "afes"("programId", "planningMode");

ALTER TABLE "ifs_forms" ADD COLUMN IF NOT EXISTS "reviewedByUserId" TEXT;
ALTER TABLE "ifs_forms" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "ifs_forms" ADD COLUMN IF NOT EXISTS "includeInSilvaReport" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "ifs_forms_programId_includeInSilvaReport_idx" ON "ifs_forms"("programId", "includeInSilvaReport");

CREATE TABLE IF NOT EXISTS "activity_requests" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "requestType" "ActivityRequestType" NOT NULL,
  "origin" "ActivityRequestOrigin" NOT NULL DEFAULT 'silva_request',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "urgency" TEXT NOT NULL DEFAULT 'normal',
  "blocksOrAreas" TEXT,
  "status" "ActivityRequestStatus" NOT NULL DEFAULT 'submitted',
  "requestedByUserId" TEXT NOT NULL,
  "convertedAfeId" TEXT,
  "dismissalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "activity_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activity_requests_programId_status_idx" ON "activity_requests"("programId", "status");
CREATE INDEX IF NOT EXISTS "activity_requests_programId_origin_idx" ON "activity_requests"("programId", "origin");

ALTER TABLE "activity_requests" ADD CONSTRAINT "activity_requests_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_requests" ADD CONSTRAINT "activity_requests_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "afes" ADD CONSTRAINT "afes_activityRequestId_fkey"
  FOREIGN KEY ("activityRequestId") REFERENCES "activity_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ifs_forms" ADD CONSTRAINT "ifs_forms_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
