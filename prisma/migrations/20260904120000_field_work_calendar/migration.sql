-- CreateEnum
CREATE TYPE "FieldWorkIntensity" AS ENUM ('peak', 'active', 'light');

-- CreateEnum
CREATE TYPE "FieldWorkCommercialStatus" AS ENUM ('confirmed', 'elective', 'quoted');

-- CreateTable
CREATE TABLE "field_work_calendars" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "farmEstateId" TEXT NOT NULL,
    "termStartDate" DATE,
    "status" "CropfortLineStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "returnedComment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_work_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_work_calendar_rows" (
    "id" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "activityId" TEXT,
    "activityCode" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "commercialStatus" "FieldWorkCommercialStatus" NOT NULL DEFAULT 'confirmed',
    "annualFeeEtb" DECIMAL(14,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_work_calendar_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_work_calendar_cells" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "monthIndex" INTEGER NOT NULL,
    "intensity" "FieldWorkIntensity" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_work_calendar_cells_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_work_calendars_farmEstateId_status_idx" ON "field_work_calendars"("farmEstateId", "status");

-- CreateIndex
CREATE INDEX "field_work_calendars_programId_idx" ON "field_work_calendars"("programId");

-- CreateIndex
CREATE INDEX "field_work_calendar_rows_calendarId_idx" ON "field_work_calendar_rows"("calendarId");

-- CreateIndex
CREATE INDEX "field_work_calendar_rows_activityCode_idx" ON "field_work_calendar_rows"("activityCode");

-- CreateIndex
CREATE INDEX "field_work_calendar_cells_rowId_idx" ON "field_work_calendar_cells"("rowId");

-- CreateIndex
CREATE UNIQUE INDEX "field_work_calendar_cells_rowId_monthIndex_key" ON "field_work_calendar_cells"("rowId", "monthIndex");

-- AddForeignKey
ALTER TABLE "field_work_calendars" ADD CONSTRAINT "field_work_calendars_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_work_calendars" ADD CONSTRAINT "field_work_calendars_farmEstateId_fkey" FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_work_calendars" ADD CONSTRAINT "field_work_calendars_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_work_calendars" ADD CONSTRAINT "field_work_calendars_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "field_work_calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_work_calendar_rows" ADD CONSTRAINT "field_work_calendar_rows_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "field_work_calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_work_calendar_rows" ADD CONSTRAINT "field_work_calendar_rows_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity_master"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_work_calendar_cells" ADD CONSTRAINT "field_work_calendar_cells_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "field_work_calendar_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
