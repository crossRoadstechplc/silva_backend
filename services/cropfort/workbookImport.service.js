/**
 * Seed a Cropfort farm's journey (stages 1-6) from the Chaka Buna simulator workbook.
 * Each stage is idempotent: existing rows are kept unless the stage owns them
 * outright (elections and activity plans are rebuilt for the target plan year).
 */
const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { requireProgramId } = require("../utils/programScope");
const { activityLineCosts } = require("../costDerivation.service");
const { getApprovedRateByCode } = require("./rateMap.service");
const benchmarkSurveyService = require("./benchmarkSurvey.service");
const farmWorkflowService = require("./farmWorkflow.service");

const STAGE_KEYS = [
  "farm_block_setup",
  "benchmark_survey",
  "rate_cards_confirmed",
  "fee_schedule_set",
  "tier_election",
  "activity_plan",
];

function workbook() {
  try {
    return require("../../lib/cropfortFieldOsImport");
  } catch (err) {
    throw new AppError(
      422,
      "WORKBOOK_UNAVAILABLE",
      "Could not read the Cropfort workbook on the server.",
    );
  }
}

async function importFarmAndBlocks(user, farm, parsers) {
  const master = parsers.parseChakaMaster();
  if (!master.blocks.length) {
    throw new AppError(422, "WORKBOOK_EMPTY", "Master sheet has no block rows.");
  }

  if (master.termStartDate) {
    await prisma.farm_estates.update({
      where: { id: farm.id },
      data: { termStartDate: master.termStartDate },
    });
  }

  const existing = await prisma.farm_blocks.findMany({
    where: { farmEstateId: farm.id },
    select: { id: true, code: true },
  });
  const byCode = new Map(existing.map((b) => [b.code, b.id]));

  let created = 0;
  let updated = 0;

  for (const block of master.blocks) {
    const data = {
      label: block.label,
      areaHa: block.areaHa,
      treeCount: block.treeCount,
      varietyPlanted: block.varietyPlanted,
      plantingDate: block.plantingDate,
      status: block.status,
    };
    const existingId = byCode.get(block.code);
    if (existingId) {
      await prisma.farm_blocks.update({ where: { id: existingId }, data });
      updated += 1;
    } else {
      await prisma.farm_blocks.create({
        data: {
          id: uuid("blk"),
          programId: farm.programId,
          farmEstateId: farm.id,
          code: block.code,
          ...data,
        },
      });
      created += 1;
    }
  }

  const legacy = existing.filter((b) => !master.blocks.some((m) => m.code === b.code));

  return {
    termStartDate: master.termStartDate?.toISOString().slice(0, 10) || null,
    blocksCreated: created,
    blocksUpdated: updated,
    unmatchedExistingBlocks: legacy.map((b) => b.code),
  };
}

async function importRateCards(user, farm, parsers) {
  const programId = farm.programId;
  const laborByCode = parsers.parseLaborRateCard();
  const materialRates = parsers.parseMaterialRateCard();
  const serviceRates = parsers.parseServiceRateCard();

  const activities = await prisma.activity_master.findMany({
    where: { programId },
    select: { id: true, code: true },
  });
  const activityByCode = new Map(activities.map((a) => [a.code, a.id]));

  const differs = (current, next) => {
    const a = current == null ? null : Number(current);
    const b = next == null ? null : Number(next);
    if (a == null || b == null) return a !== b;
    return Math.abs(a - b) > 1e-6;
  };

  const existingLabor = await prisma.labor_rate_cards.findMany({
    where: { programId, farmEstateId: farm.id },
    orderBy: { version: "desc" },
  });
  const laborByActivity = new Map();
  for (const row of existingLabor) {
    if (!laborByActivity.has(row.activityId)) laborByActivity.set(row.activityId, row);
  }

  const laborRows = [];
  let laborRefreshed = 0;
  const sheetActivityIds = new Set();

  for (const [code, labor] of laborByCode.entries()) {
    const activityId = activityByCode.get(code);
    if (!activityId) continue;
    if (labor.laborNorm == null && labor.laborWageEtb == null) continue;
    sheetActivityIds.add(activityId);

    const current = laborByActivity.get(activityId);
    if (current) {
      if (
        differs(current.normMandayPerUnit, labor.laborNorm) ||
        differs(current.wageRatePerManday, labor.laborWageEtb)
      ) {
        await prisma.labor_rate_cards.update({
          where: { id: current.id },
          data: {
            normMandayPerUnit: labor.laborNorm,
            wageRatePerManday: labor.laborWageEtb,
            status: "approved",
          },
        });
        laborRefreshed += 1;
      }
      continue;
    }

    laborRows.push({
      id: uuid("lrc"),
      programId,
      farmEstateId: farm.id,
      activityId,
      normMandayPerUnit: labor.laborNorm,
      wageRatePerManday: labor.laborWageEtb,
      status: "approved",
      version: 1,
      createdByUserId: user.id,
    });
  }
  if (laborRows.length) {
    await prisma.labor_rate_cards.createMany({ data: laborRows });
  }

  const existingRates = await prisma.rate_card_lines.findMany({
    where: { programId, farmEstateId: farm.id },
    orderBy: { version: "desc" },
  });
  const rateByCode = new Map();
  for (const row of existingRates) {
    if (!rateByCode.has(row.resourceCode)) rateByCode.set(row.resourceCode, row);
  }

  const now = new Date();
  const sheetLines = [...materialRates, ...serviceRates];
  const rateRows = [];
  let ratesRefreshed = 0;

  for (const line of sheetLines) {
    const current = rateByCode.get(line.resourceCode);
    if (current) {
      if (
        differs(current.rateEtb, line.rateEtb) ||
        current.resourceType !== line.resourceType ||
        current.unitOfMeasure !== line.unitOfMeasure
      ) {
        await prisma.rate_card_lines.update({
          where: { id: current.id },
          data: {
            resourceName: line.resourceName,
            resourceType: line.resourceType,
            unitOfMeasure: line.unitOfMeasure,
            rateEtb: line.rateEtb,
            spxJustificationNote: line.spxJustificationNote,
            status: "approved",
          },
        });
        ratesRefreshed += 1;
      }
      continue;
    }
    rateRows.push({
      id: uuid("rcl"),
      programId,
      farmEstateId: farm.id,
      resourceCode: line.resourceCode,
      resourceName: line.resourceName,
      resourceType: line.resourceType,
      unitOfMeasure: line.unitOfMeasure,
      rateEtb: line.rateEtb,
      spxJustificationNote: line.spxJustificationNote,
      status: "approved",
      version: 1,
      approvedAt: now,
      effectiveFrom: farm.termStartDate || now,
      createdByUserId: user.id,
    });
  }
  if (rateRows.length) {
    await prisma.rate_card_lines.createMany({ data: rateRows });
  }

  const sheetCodes = new Set(sheetLines.map((l) => l.resourceCode));
  const activityCodeById = new Map(activities.map((a) => [a.id, a.code]));

  return {
    laborCards: laborRows.length,
    laborCardsRefreshed: laborRefreshed,
    materialServiceLines: rateRows.length,
    materialServiceRefreshed: ratesRefreshed,
    // Demo or legacy rows this farm carries that the workbook does not define.
    nonWorkbookLaborCards: [...laborByActivity.keys()]
      .filter((id) => !sheetActivityIds.has(id))
      .map((id) => activityCodeById.get(id) || id),
    nonWorkbookRateLines: [...rateByCode.keys()].filter((code) => !sheetCodes.has(code)),
  };
}

async function importFeeSchedule(user, farm, parsers) {
  const fee = parsers.parseFeeSchedule();
  if (fee.coreAnnualFee == null) {
    throw new AppError(422, "WORKBOOK_EMPTY", "Fee Schedule sheet has no Core Services fee.");
  }

  const existing = await prisma.fee_schedules.findFirst({
    where: { programId: farm.programId, farmEstateId: farm.id },
    orderBy: { version: "desc" },
  });
  if (existing) {
    return { skipped: true, confirmedAnnualFee: Number(existing.confirmedAnnualFee) };
  }

  const schedule = await prisma.fee_schedules.create({
    data: {
      id: uuid("fsc"),
      programId: farm.programId,
      farmEstateId: farm.id,
      confirmedAnnualFee: fee.coreAnnualFee,
      status: "approved",
      version: 1,
      submittedAt: new Date(),
      approvedAt: new Date(),
      createdByUserId: user.id,
      lines: {
        create: fee.lines.map((line, i) => ({
          id: uuid("fsl"),
          label: line.label,
          annualFee: line.annualFee,
          activationMonth: line.activationMonth,
          deferred: line.deferred,
          sortOrder: i,
        })),
      },
    },
    include: { lines: true },
  });

  return {
    confirmedAnnualFee: Number(schedule.confirmedAnnualFee),
    electiveLines: schedule.lines.length,
  };
}

async function importElectionsAndPlans(user, farm, parsers, planYear) {
  const programId = farm.programId;
  const { coreBundleElected, elections } = parsers.parseAnnualElection();
  const plans = parsers.parseActivityPlan();
  if (!elections.length) {
    throw new AppError(422, "WORKBOOK_EMPTY", "Annual Election sheet has no rows.");
  }

  if (coreBundleElected != null) {
    await prisma.farm_estates.update({
      where: { id: farm.id },
      data: { coreBundleElected },
    });
  }

  const blocks = await prisma.farm_blocks.findMany({
    where: { farmEstateId: farm.id },
    select: { id: true, code: true, areaHa: true, treeCount: true },
  });
  const blockByCode = new Map(blocks.map((b) => [b.code, b]));

  const activities = await prisma.activity_master.findMany({
    where: { programId },
    include: { template: true },
  });
  const activityByCode = new Map(activities.map((a) => [a.code, a]));

  // Elections and plans are wholly derived from the workbook, so rebuild them
  // for this farm and plan year rather than accumulating duplicates.
  await prisma.supervisor_progress.deleteMany({
    where: { activityPlan: { farmEstateId: farm.id, planYear } },
  });
  await prisma.cropfort_activity_plans.deleteMany({
    where: { farmEstateId: farm.id, planYear },
  });
  await prisma.cropfort_elections.deleteMany({
    where: { farmEstateId: farm.id, planYear },
  });

  const now = new Date();
  const electionRows = [];
  const electionIdByKey = new Map();
  let skippedUnknown = 0;

  for (const row of elections) {
    const activity = activityByCode.get(row.activityCode);
    if (!activity) {
      skippedUnknown += 1;
      continue;
    }
    const block = row.blockCode ? blockByCode.get(row.blockCode) : null;
    if (row.blockCode && !block) {
      skippedUnknown += 1;
      continue;
    }
    const id = uuid("cel");
    const isTier1 = row.activityCode.startsWith("T1-");
    electionRows.push({
      id,
      programId,
      farmEstateId: farm.id,
      planYear,
      blockId: block?.id || null,
      activityId: activity.id,
      // Tier 1 inherits the core bundle tick; only Tier 2/3 carry an explicit override.
      electionOverride: isTier1 ? null : row.elected,
      commercialAgreementRef:
        !isTier1 && row.elected ? `Commercial Offer — ${row.category || "Cropfort"}` : null,
      defaultWindowStart: row.defaultWindowStart,
      defaultWindowEnd: row.defaultWindowEnd,
      plannedDurationDays: row.plannedDurationDays,
      effectiveEndDate: row.effectiveEndDate,
      status: "approved",
      version: 1,
      submittedAt: now,
      approvedAt: now,
      createdByUserId: user.id,
    });
    electionIdByKey.set(`${row.blockCode || "FARM"}|${row.activityCode}`, id);
  }

  await prisma.cropfort_elections.createMany({ data: electionRows });

  const rateMap = await getApprovedRateByCode(programId, farm.id);
  const planRows = [];

  for (const row of plans) {
    const activity = activityByCode.get(row.activityCode);
    if (!activity) continue;
    const block = row.blockCode ? blockByCode.get(row.blockCode) : null;
    if (row.blockCode && !block) continue;

    const qty = row.plannedQty ?? 0;
    const derived = activityLineCosts(qty, activity, rateMap);
    const laborCost = row.plannedLaborCost != null ? row.plannedLaborCost : derived.laborCostEtb;

    planRows.push({
      id: uuid("cap"),
      programId,
      farmEstateId: farm.id,
      planYear,
      blockId: block?.id || null,
      activityId: activity.id,
      electionId: electionIdByKey.get(`${row.blockCode || "FARM"}|${row.activityCode}`) || null,
      plannedQty: qty,
      resolvedLaborRate: row.laborRatePerUnit,
      plannedLaborCost: laborCost,
      plannedMaterialCost: derived.materialCostEtb,
      plannedServiceCost: derived.serviceCostEtb,
    });
  }

  await prisma.cropfort_activity_plans.createMany({ data: planRows });

  return {
    coreBundleElected,
    elections: electionRows.length,
    electedTier23: electionRows.filter((e) => e.blockId === null && e.electionOverride).length,
    activityPlans: planRows.length,
    skippedUnknown,
  };
}

exports.importWorkbook = async (user, farmEstateId, options = {}) => {
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findFirst({ where: { id: farmEstateId, programId } });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm not found.");

  const planYear = Number(options.planYear) || 2026;
  const requested = Array.isArray(options.stages) && options.stages.length
    ? options.stages
    : STAGE_KEYS;
  const stages = STAGE_KEYS.filter((key) => requested.includes(key));

  const catalogCount = await prisma.activity_master.count({
    where: { programId, code: { startsWith: "T1-" } },
  });
  if (!catalogCount) {
    throw new AppError(
      422,
      "CATALOG_MISSING",
      "Import the Cropfort activity catalog before seeding a farm.",
    );
  }

  const parsers = workbook();
  const result = { farmEstateId, planYear, stages: {} };

  if (stages.includes("farm_block_setup")) {
    result.stages.farm_block_setup = await importFarmAndBlocks(user, farm, parsers);
  }
  if (stages.includes("benchmark_survey")) {
    result.stages.benchmark_survey = await benchmarkSurveyService.importFromWorkbook(
      user,
      farmEstateId,
    );
  }

  // Later stages read the farm row updated above.
  const refreshed = await prisma.farm_estates.findUnique({ where: { id: farmEstateId } });

  if (stages.includes("rate_cards_confirmed")) {
    result.stages.rate_cards_confirmed = await importRateCards(user, refreshed, parsers);
  }
  if (stages.includes("fee_schedule_set")) {
    result.stages.fee_schedule_set = await importFeeSchedule(user, refreshed, parsers);
  }
  if (stages.includes("tier_election") || stages.includes("activity_plan")) {
    result.stages.tier_election = await importElectionsAndPlans(
      user,
      refreshed,
      parsers,
      planYear,
    );
  }

  if (options.completeStages !== false) {
    result.completedStages = await completeSatisfiedStages(user, farmEstateId, stages);
  }

  return result;
};

/**
 * Walk the seeded stages in order and mark each complete while its gate holds.
 * Stops at the first stage that still needs a human decision.
 */
async function completeSatisfiedStages(user, farmEstateId, stages) {
  const completed = [];
  for (const stageKey of STAGE_KEYS) {
    if (!stages.includes(stageKey)) continue;
    try {
      await farmWorkflowService.markStageComplete(farmEstateId, stageKey, user);
      completed.push(stageKey);
    } catch (err) {
      break;
    }
  }
  return completed;
}

exports.STAGE_KEYS = STAGE_KEYS;
