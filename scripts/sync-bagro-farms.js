/**
 * Sync B-Agro portfolio farms from bagrocoffee.com into the DB:
 * - Keep Chaka Buna (Silva-owned)
 * - Remove every other estate
 * - Upsert the 6 website farms with ownerOrganizationId = null
 *
 * Usage: node scripts/sync-bagro-farms.js
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { BAGRO_FARMS, CHAKA_ESTATE } = require("../lib/cropfortFieldOsImport");

const prisma = new PrismaClient();

const KEEP_NAME = /chaka\s*buna/i;

async function resolveProgramContext() {
  const chaka = await prisma.farm_estates.findFirst({
    where: { name: { equals: CHAKA_ESTATE.name, mode: "insensitive" } },
  });
  if (chaka) {
    return {
      programId: chaka.programId,
      silvaOrgId: chaka.ownerOrganizationId,
      chakaId: chaka.id,
    };
  }

  const program = await prisma.programs.findFirst({ orderBy: { createdAt: "asc" } });
  if (!program) throw new Error("No program found.");
  const silvaOrg = await prisma.organizations.findFirst({ where: { type: "silva" } });
  return {
    programId: program.id,
    silvaOrgId: silvaOrg?.id ?? null,
    chakaId: null,
  };
}

async function resolveBagroVendorId(programId) {
  const map = await prisma.farm_estate_vendors.findFirst({
    where: { farmEstate: { programId } },
    include: { vendor: true },
  });
  if (map?.vendorId) return map.vendorId;
  const vendor = await prisma.vendors.findFirst({
    where: {
      OR: [
        { name: { contains: "Agro", mode: "insensitive" } },
        { name: { contains: "Bagro", mode: "insensitive" } },
        { name: { contains: "B-Agro", mode: "insensitive" } },
      ],
    },
  });
  return vendor?.id ?? null;
}

async function deleteEstateCascade(estateId) {
  // Null / delete dependents that block farm_estates delete
  await prisma.farm_estate_vendors.deleteMany({ where: { farmEstateId: estateId } });
  await prisma.farm_workflow_stages.deleteMany({ where: { farmEstateId: estateId } });
  await prisma.benchmark_surveys.deleteMany({ where: { farmEstateId: estateId } });
  await prisma.labor_rate_cards.deleteMany({ where: { farmEstateId: estateId } });
  await prisma.rate_card_lines.deleteMany({ where: { farmEstateId: estateId } });
  await prisma.cropfort_elections.deleteMany({ where: { farmEstateId: estateId } });
  await prisma.cropfort_activity_plans.deleteMany({ where: { farmEstateId: estateId } });
  await prisma.fee_schedules.deleteMany({ where: { farmEstateId: estateId } });
  await prisma.monthly_client_reports.deleteMany({ where: { farmEstateId: estateId } });

  // Blocks: detach AFP lines / tickets first if needed
  const blocks = await prisma.farm_blocks.findMany({
    where: { farmEstateId: estateId },
    select: { id: true },
  });
  const blockIds = blocks.map((b) => b.id);
  if (blockIds.length) {
    await prisma.afp_block_lines.deleteMany({ where: { blockId: { in: blockIds } } });
    await prisma.block_field_tickets.deleteMany({ where: { blockId: { in: blockIds } } });
    await prisma.work_order_block_assignments.deleteMany({ where: { blockId: { in: blockIds } } });
    await prisma.farm_blocks.deleteMany({ where: { farmEstateId: estateId } });
  }

  await prisma.work_plan_submissions.updateMany({
    where: { farmEstateId: estateId },
    data: { farmEstateId: null },
  });
  await prisma.activity_requests.updateMany({
    where: { farmEstateId: estateId },
    data: { farmEstateId: null },
  });

  await prisma.farm_estates.delete({ where: { id: estateId } });
}

async function main() {
  const before = await prisma.farm_estates.findMany({
    select: { id: true, name: true, ownerOrganizationId: true, programId: true, status: true },
    orderBy: { name: "asc" },
  });
  console.log("Before:", before.map((e) => `${e.name} (owner=${e.ownerOrganizationId || "null"})`));

  const ctx = await resolveProgramContext();
  const { programId, silvaOrgId } = ctx;
  const bagroVendorId = await resolveBagroVendorId(programId);
  console.log({ programId, silvaOrgId, bagroVendorId });

  // 1) Remove every estate except Chaka Buna
  const toRemove = before.filter((e) => e.programId === programId && !KEEP_NAME.test(e.name));
  for (const estate of toRemove) {
    console.log(`Deleting estate: ${estate.name} (${estate.id})`);
    await deleteEstateCascade(estate.id);
  }

  // 2) Ensure Chaka Buna exists and stays Silva-owned
  let chaka = await prisma.farm_estates.findFirst({
    where: { programId, name: { equals: CHAKA_ESTATE.name, mode: "insensitive" } },
  });
  if (!chaka) {
    chaka = await prisma.farm_estates.create({
      data: {
        id: CHAKA_ESTATE.id,
        programId,
        ownerOrganizationId: silvaOrgId,
        name: CHAKA_ESTATE.name,
        totalAreaHa: CHAKA_ESTATE.totalAreaHa,
        location: CHAKA_ESTATE.location,
        termStartDate: new Date("2026-09-01T00:00:00.000Z"),
        notes: "Silva Forest Coffee — Silva asset, B-Agro execution",
        status: "active",
      },
    });
    console.log("Created Chaka Buna");
  } else if (silvaOrgId && chaka.ownerOrganizationId !== silvaOrgId) {
    chaka = await prisma.farm_estates.update({
      where: { id: chaka.id },
      data: { ownerOrganizationId: silvaOrgId, status: "active" },
    });
    console.log("Restored Chaka Buna owner to Silva org");
  }

  // 3) Upsert 6 website farms with null owner
  for (const farm of BAGRO_FARMS) {
    const existing = await prisma.farm_estates.findFirst({
      where: {
        programId,
        OR: [{ id: farm.id }, { name: { equals: farm.name, mode: "insensitive" } }],
      },
    });
    if (existing) {
      await prisma.farm_estates.update({
        where: { id: existing.id },
        data: {
          ownerOrganizationId: null,
          name: farm.name,
          location: farm.location,
          notes: `${farm.region} — from bagrocoffee.com (no Silva owner)`,
          status: "active",
        },
      });
      console.log(`Updated ${farm.name} → owner=null`);
    } else {
      await prisma.farm_estates.create({
        data: {
          id: farm.id,
          programId,
          ownerOrganizationId: null,
          name: farm.name,
          totalAreaHa: null,
          location: farm.location,
          notes: `${farm.region} — from bagrocoffee.com (no Silva owner)`,
          status: "active",
          ...(bagroVendorId
            ? {
                vendorMaps: {
                  create: {
                    id: `fev_${farm.id.replace("fest_", "")}_bagro`,
                    vendorId: bagroVendorId,
                    isPrimary: true,
                  },
                },
              }
            : {}),
          blocks: {
            create: ["A", "B", "C", "D", "E", "F", "G"].map((code) => ({
              id: `blk_${farm.id.replace("fest_", "")}_${code.toLowerCase()}`,
              programId,
              code,
              label: `Block ${code}`,
              status: "active",
            })),
          },
        },
      });
      console.log(`Created ${farm.name} → owner=null`);
    }

    // Ensure vendor map if vendor known
    if (bagroVendorId) {
      const estate = await prisma.farm_estates.findFirst({
        where: { programId, name: farm.name },
      });
      if (estate) {
        const existingMap = await prisma.farm_estate_vendors.findFirst({
          where: { farmEstateId: estate.id, vendorId: bagroVendorId },
        });
        if (!existingMap) {
          await prisma.farm_estate_vendors.create({
            data: {
              id: `fev_${estate.id.replace("fest_", "")}_bagro`.slice(0, 64),
              farmEstateId: estate.id,
              vendorId: bagroVendorId,
              isPrimary: true,
            },
          });
        }
      }
    }
  }

  // Ensure Chaka has bagro vendor map too
  if (bagroVendorId && chaka) {
    const existingMap = await prisma.farm_estate_vendors.findFirst({
      where: { farmEstateId: chaka.id, vendorId: bagroVendorId },
    });
    if (!existingMap) {
      await prisma.farm_estate_vendors.create({
        data: {
          id: `fev_chaka_buna_bagro`,
          farmEstateId: chaka.id,
          vendorId: bagroVendorId,
          isPrimary: true,
        },
      });
    }
  }

  const after = await prisma.farm_estates.findMany({
    where: { programId },
    select: { id: true, name: true, ownerOrganizationId: true, location: true },
    orderBy: { name: "asc" },
  });
  console.log("\nAfter:");
  for (const e of after) {
    console.log(`- ${e.name} @ ${e.location || "—"} | owner=${e.ownerOrganizationId || "null"}`);
  }
  console.log(`\nTotal estates: ${after.length} (expect 7 = Chaka + 6 Bagro)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
