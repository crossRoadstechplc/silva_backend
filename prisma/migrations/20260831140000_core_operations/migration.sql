-- Core Operations: intervention vs project, Cropfort AFE convert path

CREATE TYPE "CoreOperationKind" AS ENUM ('intervention', 'project');
CREATE TYPE "CoreOperationProjectStatus" AS ENUM ('active', 'complete', 'closed');

ALTER TYPE "CropfortAfeSourceType" ADD VALUE IF NOT EXISTS 'project';

ALTER TABLE "activity_requests"
  ADD COLUMN IF NOT EXISTS "operationKind" "CoreOperationKind" NOT NULL DEFAULT 'intervention',
  ADD COLUMN IF NOT EXISTS "blockIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "activityIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "plannedStartDate" DATE,
  ADD COLUMN IF NOT EXISTS "plannedEndDate" DATE,
  ADD COLUMN IF NOT EXISTS "estimatedAmountEtb" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "convertedCropfortAfeId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "activity_requests_convertedCropfortAfeId_key"
  ON "activity_requests"("convertedCropfortAfeId");

CREATE INDEX IF NOT EXISTS "activity_requests_programId_operationKind_status_idx"
  ON "activity_requests"("programId", "operationKind", "status");

ALTER TABLE "activity_requests"
  ADD CONSTRAINT "activity_requests_convertedCropfortAfeId_fkey"
  FOREIGN KEY ("convertedCropfortAfeId") REFERENCES "cropfort_afes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "core_operation_projects" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "cropfortAfeId" TEXT,
  "title" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "blockIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "activityIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "CoreOperationProjectStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "core_operation_projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "core_operation_projects_requestId_key"
  ON "core_operation_projects"("requestId");
CREATE UNIQUE INDEX IF NOT EXISTS "core_operation_projects_cropfortAfeId_key"
  ON "core_operation_projects"("cropfortAfeId");
CREATE INDEX IF NOT EXISTS "core_operation_projects_programId_status_idx"
  ON "core_operation_projects"("programId", "status");

ALTER TABLE "core_operation_projects"
  ADD CONSTRAINT "core_operation_projects_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "core_operation_projects"
  ADD CONSTRAINT "core_operation_projects_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "activity_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "core_operation_projects"
  ADD CONSTRAINT "core_operation_projects_cropfortAfeId_fkey"
  FOREIGN KEY ("cropfortAfeId") REFERENCES "cropfort_afes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
