const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { FARM_WORKFLOW_STAGES, STAGE_KEYS, stageOrder } = require("../../lib/cropfortWorkflowStages");
const { activityTierFromCode } = require("../../lib/cropfortCategoryWindows");
const { isElectionActive } = require("../../lib/cropfortElection");
const { requireProgramId } = require("../utils/programScope");
const farmEstateService = require("../farmEstate.service");

async function getFarmOrThrow(farmEstateId, user) {
  const farm = await prisma.farm_estates.findFirst({
    where: { id: farmEstateId, programId: requireProgramId(user) },
    include: { blocks: { where: { status: "active" } } },
  });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm not found.");
  return farm;
}

async function assertFarmAccess(farmEstateId, user) {
  await farmEstateService.findOne(farmEstateId, user);
}

async function getTier1Activities(programId) {
  const rows = await prisma.activity_master.findMany({
    where: { programId, code: { startsWith: "T1-" } },
    select: { id: true, code: true },
  });
  return rows;
}

const MAX_GATE_REASONS = 8;

/** Gates can fail across thousands of rows; keep the payload readable. */
function summarize(reasons) {
  if (reasons.length <= MAX_GATE_REASONS) return reasons;
  return [
    ...reasons.slice(0, MAX_GATE_REASONS),
    `…and ${reasons.length - MAX_GATE_REASONS} more.`,
  ];
}

async function checkGateStage1(farm) {
  const reasons = [];
  if (!farm.name?.trim()) reasons.push("Farm name is required.");
  if (!farm.termStartDate) reasons.push("Term start date is required.");
  const blocksWithHa = farm.blocks.filter((b) => b.areaHa != null && Number(b.areaHa) > 0);
  if (!blocksWithHa.length) reasons.push("At least one block with hectares is required.");
  return { passed: !reasons.length, reasons };
}

async function checkGateStage2(farm, programId) {
  const tier1 = await getTier1Activities(programId);
  const reasons = [];
  if (!tier1.length) {
    return {
      passed: false,
      reasons: ["Tier 1 activity catalog is not imported for this program yet."],
    };
  }
  const covered = await prisma.benchmark_surveys.findMany({
    where: {
      farmEstateId: farm.id,
      OR: [{ status: "approved" }, { useNormWage: true }],
    },
    select: { activityId: true },
  });
  const coveredIds = new Set(covered.map((s) => s.activityId));
  for (const act of tier1) {
    if (!coveredIds.has(act.id)) {
      reasons.push(`${act.code}: needs approved survey or norm×wage flag.`);
    }
  }
  return { passed: !reasons.length, reasons: summarize(reasons) };
}

async function checkGateStage3(farm, programId) {
  const matSvc = await prisma.rate_card_lines.count({
    where: { farmEstateId: farm.id, status: "approved" },
  });
  const reasons = [];
  if (matSvc < 1) reasons.push("Farm material/service rate cards must be confirmed.");
  const laborCount = await prisma.labor_rate_cards.count({
    where: { farmEstateId: farm.id, status: "approved" },
  });
  if (laborCount < 1) reasons.push("Farm labor rate cards must be confirmed.");
  return { passed: !reasons.length, reasons };
}

async function checkGateStage4(farm) {
  const schedule = await prisma.fee_schedules.findFirst({
    where: { farmEstateId: farm.id, status: { in: ["approved", "draft", "submitted"] } },
    orderBy: { version: "desc" },
    include: { lines: true },
  });
  const reasons = [];
  if (!schedule || schedule.confirmedAnnualFee == null) {
    reasons.push("Core Services annual fee is required.");
  }
  return { passed: !reasons.length, reasons };
}

async function checkGateStage5(farm) {
  const reasons = [];
  if (farm.coreBundleElected === null || farm.coreBundleElected === undefined) {
    reasons.push("Core bundle must be elected or explicitly declined.");
  }
  const t23MissingRef = await prisma.cropfort_elections.findMany({
    where: {
      farmEstateId: farm.id,
      blockId: null,
      electionOverride: true,
      commercialAgreementRef: null,
    },
    take: 5,
  });
  if (t23MissingRef.length) {
    reasons.push("Tier 2/3 elected activities require commercial agreement reference.");
  }
  return { passed: !reasons.length, reasons };
}

async function checkGateStage6(farm, programId) {
  const elected = await prisma.cropfort_elections.findMany({
    where: { farmEstateId: farm.id, status: "approved" },
    select: {
      blockId: true,
      activityId: true,
      planYear: true,
      electionOverride: true,
      activity: { select: { code: true } },
    },
  });
  if (!elected.length) {
    return { passed: false, reasons: ["No approved elections to plan."] };
  }

  const plans = await prisma.cropfort_activity_plans.findMany({
    where: { farmEstateId: farm.id },
    select: { blockId: true, activityId: true, planYear: true, plannedQty: true },
  });
  const planKey = (p) => `${p.planYear}|${p.blockId || "FARM"}|${p.activityId}`;
  const planned = new Map(plans.map((p) => [planKey(p), p.plannedQty]));

  const reasons = [];
  for (const el of elected) {
    if (!isElectionActive(farm, el)) continue;
    const qty = planned.get(planKey(el));
    if (qty == null || Number(qty) <= 0) {
      reasons.push(`${el.activity?.code || el.activityId}: planned quantity required.`);
    }
  }
  return { passed: !reasons.length, reasons: summarize(reasons) };
}


async function checkGateStage8(farm) {
  const reasons = [];
  if (!farm.termStartDate) {
    reasons.push("Term start date required.");
    return { passed: false, reasons };
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (new Date(farm.termStartDate) > today) {
    reasons.push("Supervisor progress unlocks when term start date arrives.");
  }
  return { passed: !reasons.length, reasons };
}

async function checkGateStage10(farm) {
  const stage8 = await prisma.farm_workflow_stages.findUnique({
    where: { farmEstateId_stageKey: { farmEstateId: farm.id, stageKey: "supervisor_progress" } },
  });
  if (!stage8?.completedAt) {
    return { passed: false, reasons: ["Supervisor progress stage must begin first."] };
  }
  const start = new Date(stage8.completedAt);
  const now = new Date();
  const monthElapsed =
    (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  if (monthElapsed < 1) {
    return { passed: false, reasons: ["First full reporting month has not elapsed."] };
  }
  return { passed: true, reasons: [] };
}

/**
 * Stages 6, 7 and 9 share one gate; memoize per journey build so a farm with
 * thousands of elections is not re-scanned three times per request.
 */
function memoStage6(cache) {
  return (farm, programId) => {
    if (!cache.stage6) cache.stage6 = checkGateStage6(farm, programId);
    return cache.stage6;
  };
}

function gateCheckers(cache = {}) {
  const stage6 = memoStage6(cache);
  return {
    farm_block_setup: (farm) => checkGateStage1(farm),
    benchmark_survey: (farm, programId) => checkGateStage2(farm, programId),
    rate_cards_confirmed: (farm, programId) => checkGateStage3(farm, programId),
    fee_schedule_set: (farm) => checkGateStage4(farm),
    tier_election: (farm) => checkGateStage5(farm),
    activity_plan: stage6,
    master_plan_calendar: stage6,
    supervisor_progress: (farm) => checkGateStage8(farm),
    budgets_cash_flow: stage6,
    monthly_client_report: (farm) => checkGateStage10(farm),
  };
}

function prerequisitesFor(stageKey) {
  switch (stageKey) {
    case "farm_block_setup":
      return [];
    case "benchmark_survey":
      return ["farm_block_setup"];
    case "rate_cards_confirmed":
      return ["benchmark_survey"];
    case "fee_schedule_set":
      return ["farm_block_setup"];
    case "tier_election":
      return ["benchmark_survey", "rate_cards_confirmed"];
    case "activity_plan":
      return ["tier_election"];
    case "master_plan_calendar":
      return ["activity_plan"];
    case "supervisor_progress":
      return ["master_plan_calendar"];
    case "budgets_cash_flow":
      return ["activity_plan"];
    case "monthly_client_report":
      return ["supervisor_progress"];
    default:
      return [];
  }
}

async function getCompletedStages(farmEstateId) {
  const rows = await prisma.farm_workflow_stages.findMany({
    where: { farmEstateId, completedAt: { not: null } },
  });
  return new Set(rows.map((r) => r.stageKey));
}

function resolveStageStatus(stageKey, completed, prereqsMet, gatePassed, activeKey) {
  if (completed.has(stageKey)) return "complete";
  if (!prereqsMet) return "locked";
  if (stageKey === activeKey || gatePassed) return "active";
  return "locked";
}

exports.getJourney = async (farmEstateId, user) => {
  await assertFarmAccess(farmEstateId, user);
  const programId = requireProgramId(user);
  const farm = await getFarmOrThrow(farmEstateId, user);
  const completedRows = await prisma.farm_workflow_stages.findMany({
    where: { farmEstateId },
  });
  const completed = new Set(
    completedRows.filter((r) => r.completedAt).map((r) => r.stageKey),
  );
  const completedAtMap = Object.fromEntries(
    completedRows.filter((r) => r.completedAt).map((r) => [r.stageKey, r.completedAt.toISOString()]),
  );

  let activeKey = "farm_block_setup";
  const stages = [];

  const checkers = gateCheckers();

  for (const meta of FARM_WORKFLOW_STAGES) {
    const prereqs = prerequisitesFor(meta.key);
    const prereqsMet = prereqs.every((p) => completed.has(p));
    const checker = checkers[meta.key];
    const gate = checker ? await checker(farm, programId) : { passed: true, reasons: [] };

    let status;
    if (completed.has(meta.key)) {
      status = "complete";
    } else if (!prereqsMet) {
      status = "locked";
    } else if (meta.autoComplete && gate.passed) {
      status = "active";
    } else if (meta.autoUnlockAfter && completed.has(meta.autoUnlockAfter)) {
      status = gate.passed ? "active" : "locked";
    } else {
      status = gate.passed ? "active" : prereqsMet ? "active" : "locked";
    }

    if (status === "active" && !completed.has(meta.key)) activeKey = meta.key;

    stages.push({
      key: meta.key,
      label: meta.label,
      order: meta.order,
      status,
      completedAt: completedAtMap[meta.key] || null,
      gatePassed: gate.passed,
      gateReasons: gate.reasons,
      prerequisites: prereqs,
    });
  }

  return {
    farmEstateId,
    activeStageKey: activeKey,
    stages,
  };
};

exports.markStageComplete = async (farmEstateId, stageKey, user) => {
  if (!STAGE_KEYS.includes(stageKey)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid workflow stage.");
  }
  await assertFarmAccess(farmEstateId, user);
  const programId = requireProgramId(user);
  const farm = await getFarmOrThrow(farmEstateId, user);
  const completed = await getCompletedStages(farmEstateId);
  const prereqs = prerequisitesFor(stageKey);
  if (!prereqs.every((p) => completed.has(p))) {
    throw new AppError(403, "WORKFLOW_LOCKED", `Prerequisites not met: ${prereqs.join(", ")}`);
  }
  const checker = gateCheckers()[stageKey];
  const gate = checker ? await checker(farm, programId) : { passed: true, reasons: [] };
  if (!gate.passed) {
    throw new AppError(400, "GATE_FAILED", gate.reasons.join(" "));
  }

  const row = await prisma.farm_workflow_stages.upsert({
    where: { farmEstateId_stageKey: { farmEstateId, stageKey } },
    create: {
      id: uuid("fws"),
      farmEstateId,
      stageKey,
      completedAt: new Date(),
      completedByUserId: user.id,
      gateSnapshotJson: { reasons: gate.reasons },
    },
    update: {
      completedAt: new Date(),
      completedByUserId: user.id,
      gateSnapshotJson: { reasons: gate.reasons },
    },
  });

  if (stageKey === "activity_plan" && !completed.has("master_plan_calendar")) {
    await prisma.farm_workflow_stages.upsert({
      where: { farmEstateId_stageKey: { farmEstateId, stageKey: "master_plan_calendar" } },
      create: {
        id: uuid("fws"),
        farmEstateId,
        stageKey: "master_plan_calendar",
        completedAt: new Date(),
        completedByUserId: user.id,
        gateSnapshotJson: { auto: true },
      },
      update: {
        completedAt: new Date(),
        completedByUserId: user.id,
      },
    });
  }

  return row;
};

exports.assertStageUnlocked = async (farmEstateId, minStageKey, user) => {
  const journey = await exports.getJourney(farmEstateId, user);
  const minOrder = stageOrder(minStageKey);
  const target = journey.stages.find((s) => s.key === minStageKey);
  if (!target) throw new AppError(400, "VALIDATION_ERROR", "Invalid stage.");
  const completed = journey.stages.filter((s) => s.status === "complete").map((s) => s.key);
  if (completed.includes(minStageKey)) return true;
  if (target.status === "active") return true;
  throw new AppError(403, "WORKFLOW_LOCKED", `Stage ${minStageKey} is not unlocked.`);
};

exports.isElectionActive = isElectionActive;
