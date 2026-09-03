const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { activityTierFromCode } = require("../../lib/cropfortCategoryWindows");
const { electedPlanFilter } = require("../../lib/cropfortElection");
const { requireProgramId } = require("../utils/programScope");

async function getFarmOrThrow(farmEstateId, programId) {
  const farm = await prisma.farm_estates.findFirst({
    where: { id: farmEstateId, programId },
    select: { id: true, coreBundleElected: true, termStartDate: true },
  });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm not found.");
  return farm;
}

function daysBetween(a, b) {
  return Math.max(1, Math.ceil((b - a) / (24 * 60 * 60 * 1000)) + 1);
}

function weeksInRange(from, to) {
  const weeks = [];
  const cur = new Date(from);
  cur.setUTCHours(0, 0, 0, 0);
  while (cur <= to) {
    const weekEnd = new Date(cur);
    const day = weekEnd.getUTCDay();
    const diff = day === 0 ? 0 : 7 - day;
    weekEnd.setUTCDate(weekEnd.getUTCDate() + diff);
    weeks.push({ weekEnding: weekEnd.toISOString().slice(0, 10), weekStart: new Date(cur) });
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return weeks;
}

exports.getWeeklyCashFlow = async (user, farmEstateId, fromDate, toDate) => {
  const programId = requireProgramId(user);
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const farm = await getFarmOrThrow(farmEstateId, programId);
  const allPlans = await prisma.cropfort_activity_plans.findMany({
    where: { farmEstateId, programId },
    include: {
      activity: true,
      election: { include: { activity: { select: { code: true } } } },
    },
  });
  // Only elected work consumes cash.
  const plans = allPlans.filter(electedPlanFilter(farm));
  const weeks = weeksInRange(from, to);
  const monthlyMaterialService = new Map();

  for (const plan of plans) {
    const tier = activityTierFromCode(plan.activity?.code);
    const labor = Number(plan.plannedLaborCost || 0);
    const material = Number(plan.plannedMaterialCost || 0);
    const service = Number(plan.plannedServiceCost || 0);
    const winStart = plan.election?.defaultWindowStart
      ? new Date(plan.election.defaultWindowStart)
      : from;
    const winEnd = plan.election?.effectiveEndDate
      ? new Date(plan.election.effectiveEndDate)
      : to;
    const windowDays = daysBetween(winStart, winEnd);
    const weeklyLabor = labor / Math.ceil(windowDays / 7);

    for (const week of weeks) {
      const wEnd = new Date(week.weekEnding);
      if (wEnd >= winStart && wEnd <= winEnd) {
        week.laborEtb = (week.laborEtb || 0) + weeklyLabor;
      }
    }

    const msTotal = material + service;
    if (msTotal > 0 && winStart && winEnd) {
      let cur = new Date(winStart);
      cur.setUTCDate(1);
      while (cur <= winEnd) {
        const key = cur.toISOString().slice(0, 7);
        monthlyMaterialService.set(key, (monthlyMaterialService.get(key) || 0) + msTotal / 12);
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
    }
  }

  return weeks.map((week) => {
    const monthKey = week.weekStart.toISOString().slice(0, 7);
    const monthTotal = monthlyMaterialService.get(monthKey) || 0;
    const weeksInMonth = 4;
    const materialServiceEtb = monthTotal / weeksInMonth;
    const laborEtb = Number((week.laborEtb || 0).toFixed(2));
    return {
      weekEnding: week.weekEnding,
      laborEtb,
      materialServiceEtb: Number(materialServiceEtb.toFixed(2)),
      totalCashFlowEtb: Number((laborEtb + materialServiceEtb).toFixed(2)),
    };
  });
};

exports.getBudgetRollup = async (user, farmEstateId, planYear) => {
  const programId = requireProgramId(user);
  const farm = await getFarmOrThrow(farmEstateId, programId);
  const allPlans = await prisma.cropfort_activity_plans.findMany({
    where: { farmEstateId, programId, planYear: Number(planYear) },
    include: {
      activity: true,
      block: true,
      election: { include: { activity: { select: { code: true } } } },
    },
  });
  // A plan only carries budget once its election is in force.
  const plans = allPlans.filter(electedPlanFilter(farm));
  const byBlock = new Map();
  let farmWide = { labor: 0, material: 0, service: 0, tier: "tier2_tier3" };

  for (const plan of plans) {
    const tier = activityTierFromCode(plan.activity?.code);
    const labor = Number(plan.plannedLaborCost || 0);
    const material = Number(plan.plannedMaterialCost || 0);
    const service = Number(plan.plannedServiceCost || 0);
    if (tier === "tier1") {
      const key = plan.blockId || "unknown";
      if (!byBlock.has(key)) {
        byBlock.set(key, {
          blockId: plan.blockId,
          blockCode: plan.block?.code,
          labor: 0,
          material: 0,
          service: 0,
          electedActivities: 0,
          tier: "tier1",
        });
      }
      const row = byBlock.get(key);
      row.labor += labor;
      row.material += material;
      row.service += service;
      row.electedActivities += 1;
    } else {
      farmWide.labor += labor;
      farmWide.material += material;
      farmWide.service += service;
      farmWide.electedActivities = (farmWide.electedActivities || 0) + 1;
      if (tier === "tier2") farmWide.tier2Activities = (farmWide.tier2Activities || 0) + 1;
      if (tier === "tier3") farmWide.tier3Activities = (farmWide.tier3Activities || 0) + 1;
    }
  }

  const blocks = [...byBlock.values()]
    .map((b) => ({ ...b, total: b.labor + b.material + b.service }))
    .sort((a, b) => (a.blockCode || "").localeCompare(b.blockCode || ""));
  farmWide.total = farmWide.labor + farmWide.material + farmWide.service;
  farmWide.electedActivities = farmWide.electedActivities || 0;

  return {
    farmEstateId,
    planYear: Number(planYear),
    tier1ByBlock: blocks,
    // Reported whenever Tier 2/3 work is elected, even at zero opex: those
    // tiers are billed through the fee schedule, not the farm's field costs.
    tier23FarmWide: farmWide.electedActivities > 0 ? farmWide : null,
    totals: {
      labor: blocks.reduce((s, b) => s + b.labor, 0) + farmWide.labor,
      material: blocks.reduce((s, b) => s + b.material, 0) + farmWide.material,
      service: blocks.reduce((s, b) => s + b.service, 0) + farmWide.service,
    },
  };
};
