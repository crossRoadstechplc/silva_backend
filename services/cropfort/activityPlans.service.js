const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { resolveLaborRate } = require("./resolveLaborRate.service");
const { getApprovedRateByCode } = require("./rateMap.service");
const electionsService = require("./elections.service");
const { activityTierFromCode } = require("../../lib/cropfortCategoryWindows");
const { resolveQty, materialCost, serviceCost } = require("../costDerivation.service");
const { requireProgramId } = require("../utils/programScope");

async function getRateMapForFarm(programId, farmEstateId) {
  const lines = await prisma.rate_card_lines.findMany({
    where: {
      programId,
      OR: [{ farmEstateId }, { farmEstateId: null }],
      status: "approved",
    },
    orderBy: { version: "desc" },
  });
  const map = new Map();
  for (const line of lines) {
    if (!map.has(line.resourceCode) || line.farmEstateId) {
      map.set(line.resourceCode, Number(line.rateEtb));
    }
  }
  return map;
}

function serializePlan(row, elected, costs = {}) {
  return {
    id: row.id,
    farmEstateId: row.farmEstateId,
    planYear: row.planYear,
    blockId: row.blockId,
    blockCode: row.block?.code,
    activityId: row.activityId,
    activityCode: row.activity?.code,
    activityName: row.activity?.name,
    tier: activityTierFromCode(row.activity?.code),
    electionId: row.electionId,
    elected,
    plannedQty: row.plannedQty != null ? Number(row.plannedQty) : null,
    resolvedLaborRate: row.resolvedLaborRate != null ? Number(row.resolvedLaborRate) : null,
    plannedLaborCost: row.plannedLaborCost != null ? Number(row.plannedLaborCost) : null,
    plannedMaterialCost: row.plannedMaterialCost != null ? Number(row.plannedMaterialCost) : null,
    plannedServiceCost: row.plannedServiceCost != null ? Number(row.plannedServiceCost) : null,
    totalPlannedCost: costs.totalPlannedCost ?? null,
    defaultWindowStart: row.election?.defaultWindowStart?.toISOString().slice(0, 10) || null,
    defaultWindowEnd: row.election?.effectiveEndDate?.toISOString().slice(0, 10) || null,
  };
}

exports.list = async (user, farmEstateId, query = {}) => {
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findUnique({ where: { id: farmEstateId } });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm not found.");
  const where = { farmEstateId, programId };
  if (query.planYear) where.planYear = Number(query.planYear);
  if (query.blockId) where.blockId = query.blockId;
  const rows = await prisma.cropfort_activity_plans.findMany({
    where,
    include: {
      activity: { include: { template: true } },
      block: true,
      election: true,
    },
    orderBy: [{ blockId: "asc" }, { activityId: "asc" }],
  });
  const result = [];
  for (const row of rows) {
    let elected = false;
    if (row.election) {
      elected = await electionsService.computeElected(farm, {
        ...row.election,
        activity: row.activity,
      });
    }
    const total =
      Number(row.plannedLaborCost || 0) +
      Number(row.plannedMaterialCost || 0) +
      Number(row.plannedServiceCost || 0);
    result.push(serializePlan(row, elected, { totalPlannedCost: total }));
  }
  return result;
};

exports.upsert = async (user, farmEstateId, dto) => {
  const programId = requireProgramId(user);
  const activity = await prisma.activity_master.findFirst({
    where: { id: dto.activityId, programId },
    include: { template: true },
  });
  if (!activity) throw new AppError(404, "NOT_FOUND", "Activity not found.");
  const tier = activityTierFromCode(activity.code);
  const blockId = tier === "tier1" ? dto.blockId : null;
  const election = await prisma.cropfort_elections.findFirst({
    where: {
      farmEstateId,
      planYear: dto.planYear,
      activityId: dto.activityId,
      blockId: blockId ?? null,
      status: "approved",
    },
    include: { activity: true },
  });
  const farm = await prisma.farm_estates.findUnique({ where: { id: farmEstateId } });
  if (election) {
    const elected = await electionsService.computeElected(farm, election);
    if (!elected) throw new AppError(400, "VALIDATION_ERROR", "Activity is not elected.");
  }
  const labor = await resolveLaborRate(farmEstateId, dto.activityId);
  const rateMap = await getRateMapForFarm(programId, farmEstateId);
  const qty = Number(dto.plannedQty || 0);
  const plannedLaborCost = qty * labor.rateEtb;
  let plannedMaterialCost = 0;
  let plannedServiceCost = 0;
  const matNorm = activity.materialNorm != null ? Number(activity.materialNorm) : 0;
  const svcNorm = activity.serviceNorm != null ? Number(activity.serviceNorm) : 0;
  if (matNorm > 0 && activity.materialRateCode) {
    plannedMaterialCost = materialCost(qty, matNorm, rateMap.get(activity.materialRateCode) || 0);
  }
  if (svcNorm > 0 && activity.serviceRateCode) {
    plannedServiceCost = serviceCost(qty, svcNorm, rateMap.get(activity.serviceRateCode) || 0);
  }
  const existing = await prisma.cropfort_activity_plans.findFirst({
    where: { farmEstateId, planYear: dto.planYear, activityId: dto.activityId, blockId: blockId ?? null },
  });
  const data = {
    programId,
    farmEstateId,
    planYear: dto.planYear,
    blockId,
    activityId: dto.activityId,
    electionId: election?.id || null,
    plannedQty: dto.plannedQty,
    resolvedLaborRate: labor.rateEtb,
    plannedLaborCost,
    plannedMaterialCost,
    plannedServiceCost,
  };
  const row = existing
    ? await prisma.cropfort_activity_plans.update({
        where: { id: existing.id },
        data,
        include: { activity: true, block: true, election: true },
      })
    : await prisma.cropfort_activity_plans.create({
        data: { id: uuid("cap"), ...data },
        include: { activity: true, block: true, election: true },
      });
  const elected = election ? await electionsService.computeElected(farm, election) : false;
  return serializePlan(row, elected, {
    totalPlannedCost: plannedLaborCost + plannedMaterialCost + plannedServiceCost,
  });
};

exports.createFollowUp = async (user, planId) => {
  const plan = await prisma.cropfort_activity_plans.findUnique({
    where: { id: planId },
    include: { activity: true, election: true, supervisorProgress: true },
  });
  if (!plan) throw new AppError(404, "NOT_FOUND", "Plan not found.");
  const progress = plan.supervisorProgress;
  const pct = progress ? Number(String(progress.pctComplete).replace("pct_", "")) : 0;
  const planned = Number(plan.plannedQty || 0);
  const actual = (planned * pct) / 100;
  const rolloverQty = planned - actual;
  if (rolloverQty <= 0) {
    throw new AppError(400, "VALIDATION_ERROR", "No rollover quantity.");
  }
  const election = await electionsService.upsert(user, plan.farmEstateId, {
    planYear: plan.planYear + 1,
    activityId: plan.activityId,
    blockId: plan.blockId,
    electionOverride: true,
    commercialAgreementRef: "rollover-follow-up",
  });
  const followUp = await exports.upsert(user, plan.farmEstateId, {
    planYear: plan.planYear + 1,
    activityId: plan.activityId,
    blockId: plan.blockId,
    plannedQty: rolloverQty,
  });
  return { election, followUpPlan: followUp, rolloverQty };
};
