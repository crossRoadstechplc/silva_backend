-- Farm estates (SPX-managed) + vendor mapping
CREATE TYPE "FarmEstateStatus" AS ENUM ('active', 'inactive');

CREATE TABLE "farm_estates" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalAreaHa" DECIMAL(10,2),
    "location" TEXT,
    "notes" TEXT,
    "status" "FarmEstateStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_estates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "farm_estate_vendors" (
    "id" TEXT NOT NULL,
    "farmEstateId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_estate_vendors_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "work_plan_submissions"
  ADD COLUMN IF NOT EXISTS "farmEstateId" TEXT;

ALTER TABLE "farm_blocks"
  ADD COLUMN IF NOT EXISTS "farmEstateId" TEXT;

CREATE UNIQUE INDEX "farm_estates_programId_name_key" ON "farm_estates"("programId", "name");
CREATE INDEX "farm_estates_programId_status_idx" ON "farm_estates"("programId", "status");
CREATE UNIQUE INDEX "farm_estate_vendors_farmEstateId_vendorId_key" ON "farm_estate_vendors"("farmEstateId", "vendorId");
CREATE INDEX "farm_estate_vendors_vendorId_idx" ON "farm_estate_vendors"("vendorId");
CREATE INDEX "work_plan_submissions_farmEstateId_idx" ON "work_plan_submissions"("farmEstateId");
CREATE INDEX "farm_blocks_farmEstateId_idx" ON "farm_blocks"("farmEstateId");

ALTER TABLE "farm_estates" ADD CONSTRAINT "farm_estates_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farm_estate_vendors" ADD CONSTRAINT "farm_estate_vendors_farmEstateId_fkey" FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_estate_vendors" ADD CONSTRAINT "farm_estate_vendors_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_plan_submissions" ADD CONSTRAINT "work_plan_submissions_farmEstateId_fkey" FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "farm_blocks" ADD CONSTRAINT "farm_blocks_farmEstateId_fkey" FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "farm_blocks_programId_code_key";
CREATE UNIQUE INDEX "farm_blocks_programId_farmEstateId_code_key" ON "farm_blocks"("programId", "farmEstateId", "code");
