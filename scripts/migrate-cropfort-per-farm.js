#!/usr/bin/env node
/**
 * Migrate existing Cropfort data to per-farm tenancy model.
 * Clones program rate templates to each farm, seeds labor cards, converts AFP lines.
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { clonePerFarmRates } = require("../lib/cropfortFieldOsSeed");
const { uuid } = require("../utils/ids");
const { activityTierFromCode } = require("../lib/cropfortCategoryWindows");

const prisma = new PrismaClient();
const PROGRAM_ID = process.env.MIGRATE_PROGRAM_ID || "prg_shecha";

async function migrateAfpToElectionsPlans(programId, principalId) {
  const lines = await prisma.afp_block_lines.findMany({
    where: { programId },
    include: { block: true, activity: true },
  });
  let elections = 0;
  let plans = 0;
  for (const line of lines) {
    const farmEstateId = line.block?.farmEstateId;
    if (!farmEstateId) continue;
    const tier = activityTierFromCode(line.activity?.code);
    const election = await prisma.cropfort_elections.create({
      data: {
        id: uuid("cel"),
        programId,
        farmEstateId,
        planYear: line.planYear,
        blockId: tier === "tier1" ? line.blockId : null,
        activityId: line.activityId,
        electionOverride: line.electionStatus === "elected",
        status: line.status,
        version: line.version,
        approvedAt: line.approvedAt,
        submittedAt: line.submittedAt,
        createdByUserId: line.createdByUserId || principalId,
      },
    });
    elections += 1;
    await prisma.cropfort_activity_plans.create({
      data: {
        id: uuid("cap"),
        programId,
        farmEstateId,
        planYear: line.planYear,
        blockId: tier === "tier1" ? line.blockId : null,
        activityId: line.activityId,
        electionId: election.id,
        plannedQty: line.plannedQty,
      },
    });
    plans += 1;
  }
  return { elections, plans };
}

async function initWorkflowStages(farmIds) {
  const { FARM_WORKFLOW_STAGES } = require("../lib/cropfortWorkflowStages");
  let count = 0;
  for (const farmId of farmIds) {
    for (const stage of FARM_WORKFLOW_STAGES) {
      await prisma.farm_workflow_stages.upsert({
        where: { farmEstateId_stageKey: { farmEstateId: farmId, stageKey: stage.key } },
        create: { id: uuid("fws"), farmEstateId: farmId, stageKey: stage.key },
        update: {},
      });
      count += 1;
    }
  }
  return count;
}

async function main() {
  const program = await prisma.programs.findUnique({ where: { id: PROGRAM_ID } });
  if (!program) throw new Error(`Program ${PROGRAM_ID} not found.`);

  const principal = await prisma.users.findFirst({
    where: { role: { in: ["spx_principal", "spx_platform_admin", "system_admin"] } },
    orderBy: { createdAt: "asc" },
  });
  if (!principal) throw new Error("No SPX user found.");

  const farms = await prisma.farm_estates.findMany({ where: { programId: PROGRAM_ID } });
  const farmIds = farms.map((f) => f.id);

  console.log(`Migrating ${farmIds.length} farms...`);

  const perFarmRates = await clonePerFarmRates(prisma, {
    programId: PROGRAM_ID,
    createdByUserId: principal.id,
  }, farmIds);
  console.log("Per-farm rates:", perFarmRates);

  const existingElections = await prisma.cropfort_elections.count({ where: { programId: PROGRAM_ID } });
  let afpMigration = { elections: 0, plans: 0 };
  if (!existingElections) {
    afpMigration = await migrateAfpToElectionsPlans(PROGRAM_ID, principal.id);
    console.log("AFP migration:", afpMigration);
  }

  const workflowStages = await initWorkflowStages(farmIds);
  console.log("Workflow stage rows:", workflowStages);

  await prisma.farm_estates.updateMany({
    where: { id: "fest_chaka_buna", programId: PROGRAM_ID, termStartDate: null },
    data: { termStartDate: new Date("2026-09-01T00:00:00.000Z") },
  });

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
