-- Cropfort Wave 0 migration (run manually if prisma migrate dev fails on shadow DB)

-- Enums
DO $$ BEGIN
  CREATE TYPE "CropfortRole" AS ENUM ('field_supervisor', 'bagro_office', 'spx_validator', 'farm_owner', 'spx_platform_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CropfortLineStatus" AS ENUM ('draft', 'submitted', 'approved', 'returned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CropfortElectionStatus" AS ENUM ('suggested', 'elected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BlockFieldTicketStatus" AS ENUM ('draft', 'submitted', 'reviewed_approved', 'reviewed_flagged', 'reviewed_returned', 'released');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WeeklySubmissionStatus" AS ENUM ('pending', 'submitted', 'validated', 'released');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ValidationCheckType" AS ENUM ('rate_card_compliance', 'election_compliance', 'afp_sequencing', 'variance_review', 'afe_band_check', 'materials_estimate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ValidationCheckResult" AS ENUM ('pass', 'fail', 'flag', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CropfortAfeSourceType" AS ENUM ('afp_line', 'weekly_submission', 'intervention', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "OpexReserveEnforcement" AS ENUM ('informational', 'blocking');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "UserAccountStatus" AS ENUM ('invited', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Program config columns
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortCurrency" TEXT NOT NULL DEFAULT 'ETB';
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortAfeBandAMaxEtb" DECIMAL(14,2) NOT NULL DEFAULT 500000;
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortAfeBandBMaxEtb" DECIMAL(14,2) NOT NULL DEFAULT 2000000;
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortAfeBandCMaxEtb" DECIMAL(14,2) NOT NULL DEFAULT 5000000;
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortRateFlagThresholdPct" DECIMAL(5,2) NOT NULL DEFAULT 10;
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortVarianceReviewPct" DECIMAL(5,2) NOT NULL DEFAULT 20;
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortOpexReserveMinMonths" DECIMAL(5,2) NOT NULL DEFAULT 6;
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortOpexEnforcement" "OpexReserveEnforcement" NOT NULL DEFAULT 'informational';
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortHectareContractTotal" DECIMAL(10,2);
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortPartialWeeklyRelease" BOOLEAN NOT NULL DEFAULT false;

-- Users / sessions
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accountStatus" "UserAccountStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totpEnrolledAt" TIMESTAMP(3);

ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "otpVerifiedAt" TIMESTAMP(3);
ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "deviceLabel" TEXT;
ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);

ALTER TABLE "farm_blocks" ADD COLUMN IF NOT EXISTS "assignedSupervisorUserId" TEXT;

-- See prisma/schema.prisma for full table DDL — run `npx prisma db push` when safe,
-- or use Prisma migrate after fixing shadow DB issues.
