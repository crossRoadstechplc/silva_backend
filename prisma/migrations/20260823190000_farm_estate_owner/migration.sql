-- AlterTable
ALTER TABLE "farm_estates" ADD COLUMN "ownerOrganizationId" TEXT;

-- CreateIndex
CREATE INDEX "farm_estates_ownerOrganizationId_idx" ON "farm_estates"("ownerOrganizationId");

-- AddForeignKey
ALTER TABLE "farm_estates" ADD CONSTRAINT "farm_estates_ownerOrganizationId_fkey" FOREIGN KEY ("ownerOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
