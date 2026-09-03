-- Cropfort Field OS catalog: activity costing fields + rate card resource type

ALTER TABLE "activity_templates"
  ADD COLUMN IF NOT EXISTS "laborNorm" DECIMAL(14,4),
  ADD COLUMN IF NOT EXISTS "materialNorm" DECIMAL(14,4),
  ADD COLUMN IF NOT EXISTS "serviceNorm" DECIMAL(14,4),
  ADD COLUMN IF NOT EXISTS "laborWageEtb" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "laborCostPerUnit" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "materialRateCode" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceRateCode" TEXT;

ALTER TABLE "activity_master"
  ADD COLUMN IF NOT EXISTS "laborWageEtb" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "laborCostPerUnit" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "materialRateCode" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceRateCode" TEXT,
  ADD COLUMN IF NOT EXISTS "benchmarkFarmARate" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "benchmarkFarmBRate" DECIMAL(14,2);

ALTER TABLE "rate_card_lines"
  ADD COLUMN IF NOT EXISTS "resourceType" TEXT;
