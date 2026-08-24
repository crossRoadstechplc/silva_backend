-- B-Agro Chetu Farm activity catalog (agronomy norms + monthly schedule)
CREATE TABLE "activity_catalog" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "afpLineId" TEXT NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "sectionLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAm" TEXT,
    "unit" TEXT NOT NULL,
    "normMdPerUnit" DECIMAL(10,6),
    "normCostEtb" DECIMAL(14,4),
    "normWageEtb" DECIMAL(10,2),
    "normsPerMd" DECIMAL(10,2),
    "annualQuantity" DECIMAL(14,2),
    "annualMandays" DECIMAL(14,2),
    "annualCostEtb" DECIMAL(14,2),
    "scopeJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_catalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activity_schedule" (
    "id" TEXT NOT NULL,
    "activityCatalogId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "plannedQuantity" DECIMAL(14,2),
    "plannedMandays" DECIMAL(14,2),
    "plannedCostEtb" DECIMAL(14,2),

    CONSTRAINT "activity_schedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "activity_catalog_programId_afpLineId_idx" ON "activity_catalog"("programId", "afpLineId");
CREATE INDEX "activity_catalog_programId_sectionCode_idx" ON "activity_catalog"("programId", "sectionCode");
CREATE INDEX "activity_schedule_programId_year_month_idx" ON "activity_schedule"("programId", "year", "month");

CREATE UNIQUE INDEX "activity_schedule_activityCatalogId_year_month_key" ON "activity_schedule"("activityCatalogId", "year", "month");

ALTER TABLE "activity_catalog" ADD CONSTRAINT "activity_catalog_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_catalog" ADD CONSTRAINT "activity_catalog_afpLineId_fkey" FOREIGN KEY ("afpLineId") REFERENCES "afp_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "activity_schedule" ADD CONSTRAINT "activity_schedule_activityCatalogId_fkey" FOREIGN KEY ("activityCatalogId") REFERENCES "activity_catalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_schedule" ADD CONSTRAINT "activity_schedule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_orders" ADD COLUMN "activityCatalogId" TEXT;
CREATE INDEX "work_orders_activityCatalogId_idx" ON "work_orders"("activityCatalogId");
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_activityCatalogId_fkey" FOREIGN KEY ("activityCatalogId") REFERENCES "activity_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
