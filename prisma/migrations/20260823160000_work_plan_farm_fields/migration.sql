ALTER TABLE "work_plan_submissions"
  ADD COLUMN IF NOT EXISTS "farmName" TEXT,
  ADD COLUMN IF NOT EXISTS "totalAreaHa" DECIMAL(10, 2);
