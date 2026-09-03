const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const {
  computeElectionWindows,
  computeEffectiveEndDate,
  activityTierFromCode,
} = require("../../lib/cropfortCategoryWindows");
const farmWorkflowService = require("./farmWorkflow.service");
const { requireProgramId } = require("../utils/programScope");

function serializeElection(row, farm, elected) {
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
    electionOverride: row.electionOverride,
    elected,
    commercialAgreementRef: row.commercialAgreementRef,
    defaultWindowStart: row.defaultWindowStart?.toISOString().slice(0, 10) || null,
    defaultWindowEnd: row.defaultWindowEnd?.toISOString().slice(0, 10) || null,
    plannedDurationDays: row.plannedDurationDays,
    effectiveEndDate: row.effectiveEndDate?.toISOString().slice(0, 10) || null,
    status: row.status,
    version: row.version,
  };
}

async function computeElected(farm, election) {
  const tier = activityTierFromCode(election.activity?.code);
  if (tier === "tier1") {
    if (election.electionOverride != null) return election.electionOverride;
    return Boolean(farm.coreBundleElected);
  }
  return Boolean(election.electionOverride);
}

exports.list = async (user, farmEstateId, query = {}) => {
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findFirst({
    where: { id: farmEstateId, programId },
    include: { blocks: true },
  });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm not found.");
  const where = { farmEstateId, programId };
  if (query.planYear) where.planYear = Number(query.planYear);
  if (query.blockId) where.blockId = query.blockId;
  if (query.tier === "tier1") where.blockId = { not: null };
  if (query.tier === "tier2" || query.tier === "tier3") where.blockId = null;
  const rows = await prisma.cropfort_elections.findMany({
    where,
    include: { activity: { include: { template: true } }, block: true },
    orderBy: [{ blockId: "asc" }, { activityId: "asc" }],
  });
  const result = [];
  for (const row of rows) {
    const elected = await computeElected(farm, row);
    result.push(serializeElection(row, farm, elected));
  }
  return result;
};

exports.setCoreBundle = async (user, farmEstateId, elected) => {
  requireProgramId(user);
  const farm = await prisma.farm_estates.update({
    where: { id: farmEstateId },
    data: { coreBundleElected: elected },
  });
  return { farmEstateId, coreBundleElected: farm.coreBundleElected };
};

exports.upsert = async (user, farmEstateId, dto) => {
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findUnique({ where: { id: farmEstateId } });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm not found.");
  const activity = await prisma.activity_master.findFirst({
    where: { id: dto.activityId, programId },
    include: { template: true },
  });
  if (!activity) throw new AppError(404, "NOT_FOUND", "Activity not found.");
  const tier = activityTierFromCode(activity.code);
  const blockId = tier === "tier1" ? dto.blockId : null;
  if (tier === "tier1" && !blockId) {
    throw new AppError(400, "VALIDATION_ERROR", "Tier 1 elections require a block.");
  }
  if ((tier === "tier2" || tier === "tier3") && dto.electionOverride && !dto.commercialAgreementRef) {
    throw new AppError(400, "VALIDATION_ERROR", "Commercial agreement reference required.");
  }
  const category = activity.template?.category || activity.name;
  const windows = computeElectionWindows(farm.termStartDate, category, activity.code);
  const effectiveEndDate = computeEffectiveEndDate(
    windows.defaultWindowStart,
    windows.defaultWindowEnd,
    dto.plannedDurationDays,
  );
  const existing = await prisma.cropfort_elections.findFirst({
    where: {
      farmEstateId,
      planYear: dto.planYear,
      activityId: dto.activityId,
      blockId: blockId ?? null,
      status: { in: ["draft", "submitted", "approved"] },
    },
    orderBy: { version: "desc" },
  });
  if (existing && existing.status !== "draft") {
    throw new AppError(400, "INVALID_STATE", "Create a new version instead of editing approved election.");
  }
  const data = {
    programId,
    farmEstateId,
    planYear: dto.planYear,
    blockId,
    activityId: dto.activityId,
    electionOverride: dto.electionOverride,
    commercialAgreementRef: dto.commercialAgreementRef?.trim() || null,
    defaultWindowStart: windows.defaultWindowStart,
    defaultWindowEnd: windows.defaultWindowEnd,
    plannedDurationDays: dto.plannedDurationDays ?? null,
    effectiveEndDate,
    createdByUserId: user.id,
  };
  const row = existing
    ? await prisma.cropfort_elections.update({
        where: { id: existing.id },
        data,
        include: { activity: true, block: true },
      })
    : await prisma.cropfort_elections.create({
        data: { id: uuid("cel"), ...data },
        include: { activity: true, block: true },
      });
  const elected = await computeElected(farm, row);
  return serializeElection(row, farm, elected);
};

exports.submit = async (user, electionId) => {
  const row = await prisma.cropfort_elections.update({
    where: { id: electionId, status: "draft" },
    data: { status: "submitted", submittedAt: new Date() },
    include: { activity: true, block: true },
  });
  const farm = await prisma.farm_estates.findUnique({ where: { id: row.farmEstateId } });
  return serializeElection(row, farm, await computeElected(farm, row));
};

exports.approve = async (user, electionId) => {
  const existing = await prisma.cropfort_elections.findUnique({ where: { id: electionId } });
  if (!existing || existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATE", "Election must be submitted.");
  }
  const farm = await prisma.farm_estates.findUnique({ where: { id: existing.farmEstateId } });
  if (farm.approverUserId && farm.approverUserId !== user.id) {
    throw new AppError(403, "FORBIDDEN", "Only farm approver may approve elections.");
  }
  const row = await prisma.cropfort_elections.update({
    where: { id: electionId },
    data: { status: "approved", approvedAt: new Date() },
    include: { activity: true, block: true },
  });
  return serializeElection(row, farm, await computeElected(farm, row));
};

exports.computeElected = computeElected;
