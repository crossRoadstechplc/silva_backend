-- Widen Cropfort rate and norm precision so stored values match the source
-- workbook exactly. Benchmark rates are the mean of two 2-decimal neighbour
-- quotes (3 decimals), and labour norms carry up to 5 decimals (e.g. 0.00667).

ALTER TABLE "activity_templates"
  ALTER COLUMN "laborNorm" TYPE DECIMAL(14, 6),
  ALTER COLUMN "materialNorm" TYPE DECIMAL(14, 6),
  ALTER COLUMN "serviceNorm" TYPE DECIMAL(14, 6),
  ALTER COLUMN "laborCostPerUnit" TYPE DECIMAL(14, 4);

ALTER TABLE "activity_master"
  ALTER COLUMN "laborNorm" TYPE DECIMAL(14, 6),
  ALTER COLUMN "materialNorm" TYPE DECIMAL(14, 6),
  ALTER COLUMN "serviceNorm" TYPE DECIMAL(14, 6),
  ALTER COLUMN "laborCostPerUnit" TYPE DECIMAL(14, 4),
  ALTER COLUMN "benchmarkFarmARate" TYPE DECIMAL(14, 4),
  ALTER COLUMN "benchmarkFarmBRate" TYPE DECIMAL(14, 4);

ALTER TABLE "rate_card_lines"
  ALTER COLUMN "rateEtb" TYPE DECIMAL(14, 4),
  ALTER COLUMN "benchmarkFarmARate" TYPE DECIMAL(14, 4),
  ALTER COLUMN "benchmarkFarmBRate" TYPE DECIMAL(14, 4);

ALTER TABLE "benchmark_surveys"
  ALTER COLUMN "neighbor1Rate" TYPE DECIMAL(14, 4),
  ALTER COLUMN "neighbor2Rate" TYPE DECIMAL(14, 4),
  ALTER COLUMN "recommendedRate" TYPE DECIMAL(14, 4),
  ALTER COLUMN "proposedRate" TYPE DECIMAL(14, 4);

ALTER TABLE "labor_rate_cards"
  ALTER COLUMN "normMandayPerUnit" TYPE DECIMAL(14, 6);

ALTER TABLE "cropfort_activity_plans"
  ALTER COLUMN "resolvedLaborRate" TYPE DECIMAL(14, 4);
