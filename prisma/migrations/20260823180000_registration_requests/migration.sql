-- AlterEnum
ALTER TYPE "TenantStatus" ADD VALUE IF NOT EXISTS 'pending';

-- CreateEnum
CREATE TYPE "RegistrationRequestStatus" AS ENUM ('submitted', 'under_review', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "registration_requests" (
    "id" TEXT NOT NULL,
    "orgType" "OrganizationType" NOT NULL,
    "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'submitted',
    "orgName" TEXT NOT NULL,
    "orgSlug" TEXT NOT NULL,
    "displayName" TEXT,
    "legalName" TEXT,
    "country" TEXT,
    "region" TEXT,
    "address" TEXT,
    "website" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactTitle" TEXT,
    "assetInterests" TEXT,
    "estimatedHectares" DECIMAL(12,2),
    "governanceNotes" TEXT,
    "vendorCategory" TEXT,
    "servicesProvided" TEXT,
    "insuranceOnFile" BOOLEAN,
    "fieldCapacity" TEXT,
    "profileJson" JSONB,
    "reviewNotes" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "provisionedOrgId" TEXT,
    "activationTokenHash" TEXT,
    "activationExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registration_requests_status_idx" ON "registration_requests"("status");
CREATE INDEX "registration_requests_contactEmail_idx" ON "registration_requests"("contactEmail");
CREATE INDEX "registration_requests_orgSlug_idx" ON "registration_requests"("orgSlug");

-- AddForeignKey
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_provisionedOrgId_fkey" FOREIGN KEY ("provisionedOrgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
