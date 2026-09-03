#!/usr/bin/env node
/**
 * Reset one farm's Cropfort journey back to an unstarted state so the 10-stage
 * flow can be walked again from scratch.
 *
 * Scoped to the given farm: it clears derived per-farm records only. The
 * program-level activity catalog, field tickets, work orders and every other
 * farm are left untouched.
 *
 *   node scripts/reset-cropfort-farm-journey.js --farm <farmEstateId> --confirm
 *   node scripts/reset-cropfort-farm-journey.js --farm <farmEstateId> --confirm --blocks
 */
require("dotenv").config();
const prisma = require("../config/database");

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

async function main() {
  const farmEstateId = arg("farm");
  if (!farmEstateId) {
    console.error("Missing --farm <farmEstateId>");
    process.exit(2);
  }

  const farm = await prisma.farm_estates.findUnique({ where: { id: farmEstateId } });
  if (!farm) {
    console.error(`Farm ${farmEstateId} not found.`);
    process.exit(2);
  }

  const alsoBlocks = flag("blocks");

  if (!flag("confirm")) {
    console.log(`Would reset the journey for ${farm.name} (${farmEstateId}):`);
    console.log("  workflow stage completions, elections, activity plans,");
    console.log("  supervisor progress, benchmark surveys, fee schedules,");
    console.log("  per-farm labour rate cards and material/service rate lines");
    console.log(`  blocks: ${alsoBlocks ? "DELETED" : "kept"}`);
    console.log("\nRe-run with --confirm to apply.");
    process.exit(0);
  }

  const counts = {};

  counts.supervisorProgress = (
    await prisma.supervisor_progress.deleteMany({
      where: { activityPlan: { farmEstateId } },
    })
  ).count;
  counts.activityPlans = (
    await prisma.cropfort_activity_plans.deleteMany({ where: { farmEstateId } })
  ).count;
  counts.elections = (await prisma.cropfort_elections.deleteMany({ where: { farmEstateId } })).count;
  counts.benchmarkSurveys = (
    await prisma.benchmark_surveys.deleteMany({ where: { farmEstateId } })
  ).count;

  const schedules = await prisma.fee_schedules.findMany({
    where: { farmEstateId },
    select: { id: true },
  });
  counts.feeScheduleLines = (
    await prisma.fee_schedule_lines.deleteMany({
      where: { feeScheduleId: { in: schedules.map((s) => s.id) } },
    })
  ).count;
  counts.feeSchedules = (await prisma.fee_schedules.deleteMany({ where: { farmEstateId } })).count;

  counts.laborRateCards = (
    await prisma.labor_rate_cards.deleteMany({ where: { farmEstateId } })
  ).count;
  counts.rateCardLines = (
    await prisma.rate_card_lines.deleteMany({ where: { farmEstateId } })
  ).count;
  counts.workflowStages = (
    await prisma.farm_workflow_stages.deleteMany({ where: { farmEstateId } })
  ).count;

  if (alsoBlocks) {
    const blocks = await prisma.farm_blocks.findMany({
      where: { farmEstateId },
      select: { id: true, code: true },
    });
    const removable = [];
    for (const block of blocks) {
      const [assignments, afpLines, tickets] = await Promise.all([
        prisma.work_order_block_assignments.count({ where: { blockId: block.id } }),
        prisma.afp_block_lines.count({ where: { blockId: block.id } }),
        prisma.block_field_tickets.count({ where: { blockId: block.id } }),
      ]);
      if (assignments + afpLines + tickets === 0) removable.push(block);
    }
    counts.blocks = (
      await prisma.farm_blocks.deleteMany({ where: { id: { in: removable.map((b) => b.id) } } })
    ).count;
    const kept = blocks.length - removable.length;
    if (kept) console.log(`Kept ${kept} block(s) still referenced by tickets or work orders.`);
  }

  await prisma.farm_estates.update({
    where: { id: farmEstateId },
    data: { termStartDate: null, coreBundleElected: null },
  });

  console.log(`Reset ${farm.name} (${farmEstateId}):`);
  for (const [key, value] of Object.entries(counts)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log("\nJourney is back to stage 1. Re-seed with the workbook or walk it manually.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
