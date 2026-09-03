#!/usr/bin/env node
/**
 * Apply Cropfort Field OS catalog + B-Agro farm portfolio to an existing database
 * without wiping users or unrelated program data.
 *
 * Usage: node scripts/migrate-bagro-portfolio.js
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { importCropfortFieldOsAndFarms } = require("../lib/cropfortFieldOsSeed");

const prisma = new PrismaClient();

const PROGRAM_ID = process.env.MIGRATE_PROGRAM_ID || "prg_shecha";
const SILVA_ORG_ID = "org_silva";
const BAGRO_VENDOR_ID = "vnd_bagro";

async function main() {
  const program = await prisma.programs.findUnique({ where: { id: PROGRAM_ID } });
  if (!program) {
    throw new Error(`Program ${PROGRAM_ID} not found. Run seed or set MIGRATE_PROGRAM_ID.`);
  }

  const principal = await prisma.users.findFirst({
    where: { role: { in: ["spx_principal", "spx_platform_admin", "system_admin"] } },
    orderBy: { createdAt: "asc" },
  });
  if (!principal) {
    throw new Error("No SPX user found to attribute rate card creation.");
  }

  console.log(`Migrating program ${PROGRAM_ID}...`);
  const result = await importCropfortFieldOsAndFarms(prisma, {
    programId: PROGRAM_ID,
    silvaOrgId: SILVA_ORG_ID,
    bagroVendorId: BAGRO_VENDOR_ID,
    createdByUserId: principal.id,
  });

  console.log("Catalog:", result.catalog);
  console.log("Farms:", result.farms);
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
