#!/usr/bin/env node
/**
 * Verify that a farm's stored rates, norms and plans match the Cropfort
 * simulator workbook exactly.
 *
 *   node scripts/verify-cropfort-workbook-parity.js --farm <farmEstateId> [--year 2026]
 */
require("dotenv").config();
const prisma = require("../config/database");
const parsers = require("../lib/cropfortFieldOsImport");
const { resolveLaborRate } = require("../services/cropfort/resolveLaborRate.service");

const EPSILON = 1e-6;
const near = (a, b) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) < EPSILON;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function report(label, failures, total) {
  const ok = failures.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} (${total - failures.length}/${total})`);
  failures.slice(0, 10).forEach((f) => console.log(`        ${f}`));
  if (failures.length > 10) console.log(`        …and ${failures.length - 10} more`);
  return ok;
}

async function main() {
  const farmEstateId = arg("farm");
  const planYear = Number(arg("year", "2026"));
  if (!farmEstateId) {
    console.error("Missing --farm <farmEstateId>");
    process.exit(2);
  }

  const farm = await prisma.farm_estates.findUnique({ where: { id: farmEstateId } });
  if (!farm) {
    console.error(`Farm ${farmEstateId} not found.`);
    process.exit(2);
  }

  const laborSheet = parsers.parseLaborRateCard();
  const catalog = parsers.loadCatalog();
  const masterSheet = parsers.parseChakaMaster();
  const planSheet = parsers.parseActivityPlan();

  const activities = await prisma.activity_master.findMany({
    where: { programId: farm.programId },
    orderBy: { code: "asc" },
  });
  const activityByCode = new Map(activities.map((a) => [a.code, a]));

  console.log(`Farm: ${farm.name} (${farmEstateId})  plan year ${planYear}\n`);
  const results = [];

  // Catalog norms, wages and final unit costs.
  const catalogFailures = [];
  for (const [code, sheet] of laborSheet) {
    const row = activityByCode.get(code);
    if (!row) {
      catalogFailures.push(`${code}: absent from activity_master`);
      continue;
    }
    if (!near(row.laborNorm, sheet.laborNorm)) {
      catalogFailures.push(`${code} norm: db=${row.laborNorm} sheet=${sheet.laborNorm}`);
    }
    if (!near(row.laborWageEtb, sheet.laborWageEtb)) {
      catalogFailures.push(`${code} wage: db=${row.laborWageEtb} sheet=${sheet.laborWageEtb}`);
    }
    if (!near(row.laborCostPerUnit, sheet.laborCostPerUnit)) {
      catalogFailures.push(
        `${code} final cost: db=${row.laborCostPerUnit} sheet=${sheet.laborCostPerUnit}`,
      );
    }
  }
  results.push(report("activity catalog norms and rates", catalogFailures, laborSheet.size));

  // Per-farm labour rate cards.
  const cards = await prisma.labor_rate_cards.findMany({ where: { farmEstateId } });
  const cardByActivity = new Map(cards.map((c) => [c.activityId, c]));
  const cardFailures = [];
  let cardExpected = 0;
  for (const [code, sheet] of laborSheet) {
    if (sheet.laborNorm == null && sheet.laborWageEtb == null) continue;
    cardExpected += 1;
    const activity = activityByCode.get(code);
    const card = activity && cardByActivity.get(activity.id);
    if (!card) {
      cardFailures.push(`${code}: no labour rate card`);
      continue;
    }
    if (!near(card.normMandayPerUnit, sheet.laborNorm)) {
      cardFailures.push(`${code} norm: card=${card.normMandayPerUnit} sheet=${sheet.laborNorm}`);
    }
    if (!near(card.wageRatePerManday, sheet.laborWageEtb)) {
      cardFailures.push(`${code} wage: card=${card.wageRatePerManday} sheet=${sheet.laborWageEtb}`);
    }
  }
  results.push(report("per-farm labour rate cards", cardFailures, cardExpected));

  // Material and outsourced service rates.
  const rateLines = await prisma.rate_card_lines.findMany({ where: { farmEstateId } });
  const lineByCode = new Map(rateLines.map((r) => [r.resourceCode, r]));
  const sheetLines = [...catalog.materialRates, ...catalog.serviceRates];
  const lineFailures = [];
  for (const sheet of sheetLines) {
    const line = lineByCode.get(sheet.resourceCode);
    if (!line) {
      lineFailures.push(`${sheet.resourceCode}: missing rate card line`);
      continue;
    }
    if (!near(line.rateEtb, sheet.rateEtb)) {
      lineFailures.push(`${sheet.resourceCode} rate: db=${line.rateEtb} sheet=${sheet.rateEtb}`);
    }
    if (line.unitOfMeasure !== sheet.unitOfMeasure) {
      lineFailures.push(
        `${sheet.resourceCode} unit: db=${line.unitOfMeasure} sheet=${sheet.unitOfMeasure}`,
      );
    }
  }
  results.push(report("material and service rates", lineFailures, sheetLines.length));

  // Effective labour rate the costing path will actually use.
  const tier1 = activities.filter((a) => a.code.startsWith("T1-"));
  const resolvedFailures = [];
  for (const activity of tier1) {
    const sheet = laborSheet.get(activity.code);
    const expected =
      sheet?.laborCostPerUnit ??
      (sheet?.laborNorm && sheet?.laborWageEtb ? sheet.laborNorm * sheet.laborWageEtb : 0);
    const resolved = await resolveLaborRate(farmEstateId, activity.id);
    if (!near(resolved.rateEtb, expected)) {
      resolvedFailures.push(
        `${activity.code}: sheet=${expected} system=${resolved.rateEtb} (${resolved.source})`,
      );
    }
  }
  results.push(report("resolved labour rate vs sheet final cost", resolvedFailures, tier1.length));

  // Blocks.
  const blocks = await prisma.farm_blocks.findMany({ where: { farmEstateId } });
  const blockByCode = new Map(blocks.map((b) => [b.code, b]));
  const blockFailures = [];
  for (const sheet of masterSheet.blocks) {
    const block = blockByCode.get(sheet.code);
    if (!block) {
      blockFailures.push(`${sheet.code}: missing block`);
      continue;
    }
    if (!near(block.areaHa, sheet.areaHa)) {
      blockFailures.push(`${sheet.code} hectares: db=${block.areaHa} sheet=${sheet.areaHa}`);
    }
    if (Number(block.treeCount ?? 0) !== Number(sheet.treeCount ?? 0)) {
      blockFailures.push(`${sheet.code} trees: db=${block.treeCount} sheet=${sheet.treeCount}`);
    }
  }
  results.push(report("block registry", blockFailures, masterSheet.blocks.length));

  // Activity plans.
  const blockCodeById = new Map(blocks.map((b) => [b.id, b.code]));
  const plans = await prisma.cropfort_activity_plans.findMany({
    where: { farmEstateId, planYear },
    include: { activity: { select: { code: true } } },
  });
  const planKey = (blockCode, activityCode) => `${blockCode || "FARM"}|${activityCode}`;
  const planMap = new Map(
    plans.map((p) => [planKey(p.blockId ? blockCodeById.get(p.blockId) : null, p.activity.code), p]),
  );
  const planFailures = [];
  for (const sheet of planSheet) {
    const key = planKey(sheet.blockCode, sheet.activityCode);
    const plan = planMap.get(key);
    if (!plan) {
      planFailures.push(`${key}: missing activity plan`);
      continue;
    }
    if (!near(plan.plannedQty, sheet.plannedQty)) {
      planFailures.push(`${key} qty: db=${plan.plannedQty} sheet=${sheet.plannedQty}`);
    }
    if (!near(plan.resolvedLaborRate, sheet.laborRatePerUnit)) {
      planFailures.push(
        `${key} rate: db=${plan.resolvedLaborRate} sheet=${sheet.laborRatePerUnit}`,
      );
    }
    if (Math.abs(Number(plan.plannedLaborCost ?? 0) - Number(sheet.plannedLaborCost ?? 0)) > 0.01) {
      planFailures.push(
        `${key} cost: db=${plan.plannedLaborCost} sheet=${sheet.plannedLaborCost}`,
      );
    }
  }
  results.push(report("activity plans", planFailures, planSheet.length));

  // Rows this farm carries that the workbook does not define.
  const sheetLineCodes = new Set(sheetLines.map((l) => l.resourceCode));
  const extraLines = rateLines.filter((r) => !sheetLineCodes.has(r.resourceCode));
  if (extraLines.length) {
    console.log(
      `\nNote: ${extraLines.length} rate card line(s) not defined by the workbook: ` +
        extraLines.map((r) => r.resourceCode).join(", "),
    );
  }

  const allPassed = results.every(Boolean);
  console.log(`\n${allPassed ? "All parity checks passed." : "Parity check FAILED."}`);
  process.exit(allPassed ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
