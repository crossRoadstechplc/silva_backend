#!/usr/bin/env node
/**
 * Import Cropfort Field OS catalog from Template + Chaka Buna Simulator workbooks.
 * Optionally imports B-Agro farm portfolio when --farms is passed.
 *
 * Usage:
 *   node scripts/import-cropfort-field-os.js            # replaces catalog (destructive)
 *   node scripts/import-cropfort-field-os.js --additive  # keeps existing rows, adds missing
 *   node scripts/import-cropfort-field-os.js --farms     # also rebuilds farm portfolio
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { loadCatalog } = require("../lib/cropfortFieldOsImport");
const {
  importCropfortFieldOs,
  importCropfortFieldOsAndFarms,
} = require("../lib/cropfortFieldOsSeed");

const prisma = new PrismaClient();

const PROGRAM_ID = process.env.MIGRATE_PROGRAM_ID || "prg_shecha";
const SILVA_ORG_ID = "org_silva";
const BAGRO_VENDOR_ID = "vnd_bagro";
const withFarms = process.argv.includes("--farms");
const additive = process.argv.includes("--additive");

async function main() {
  const catalog = loadCatalog();
  console.log(
    `Loaded catalog: ${catalog.activities.length} activities, ` +
      `${catalog.materialRates.length} material + ${catalog.serviceRates.length} service rate lines, ` +
      `${catalog.chakaBlocks.length} Chaka blocks`,
  );

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

  const ctx = {
    programId: PROGRAM_ID,
    silvaOrgId: SILVA_ORG_ID,
    bagroVendorId: BAGRO_VENDOR_ID,
    createdByUserId: principal.id,
  };

  if (withFarms && additive) {
    throw new Error("--farms rebuilds the farm portfolio and cannot be combined with --additive.");
  }

  const result = withFarms
    ? await importCropfortFieldOsAndFarms(prisma, ctx)
    : { catalog: await importCropfortFieldOs(prisma, ctx, { replace: !additive }) };

  console.log(JSON.stringify(result, null, 2));
  console.log("Import complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
