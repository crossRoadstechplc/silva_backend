const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { requireProgramId } = require("../utils/programScope");

const PCT_VALUES = {
  pct_0: 0,
  pct_25: 25,
  pct_50: 50,
  pct_75: 75,
  pct_100: 100,
};

function weeksSince(date) {
  if (!date) return null;
  return (Date.now() - new Date(date).getTime()) / (7 * 24 * 60 * 60 * 1000);
}

function serialize(row) {
  const pct = PCT_VALUES[row.pctComplete] ?? 0;
  const planned = Number(row.activityPlan?.plannedQty || 0);
  const actualQtyDone = (planned * pct) / 100;
  const laborRate = Number(row.activityPlan?.resolvedLaborRate || 0);
  const laborCostBooked = actualQtyDone * laborRate;
  const stallFlag = weeksSince(row.lastMovementDate) >= 2 && pct < 100;
  let rolloverQty = null;
  const endDate = row.activityPlan?.election?.effectiveEndDate;
  if (endDate && new Date() > new Date(endDate) && pct < 100) {
    rolloverQty = planned - actualQtyDone;
  }
  return {
    id: row.id,
    activityPlanId: row.activityPlanId,
    activityCode: row.activityPlan?.activity?.code,
    blockCode: row.activityPlan?.block?.code,
    pctComplete: row.pctComplete,
    pctValue: pct,
    lastMovementDate: row.lastMovementDate?.toISOString().slice(0, 10) || null,
    actualQtyDone,
    laborCostBooked,
    stallFlag,
    atRisk: stallFlag,
    rolloverQty,
  };
}

exports.list = async (user, farmEstateId, query = {}) => {
  const programId = requireProgramId(user);
  const rows = await prisma.supervisor_progress.findMany({
    where: {
      programId,
      activityPlan: { farmEstateId, ...(query.planYear ? { planYear: Number(query.planYear) } : {}) },
    },
    include: {
      activityPlan: {
        include: { activity: true, block: true, election: true },
      },
    },
  });
  return rows.map(serialize);
};

exports.upsert = async (user, activityPlanId, pctComplete, lastMovementDate) => {
  const programId = requireProgramId(user);
  const plan = await prisma.cropfort_activity_plans.findUnique({
    where: { id: activityPlanId },
    include: { election: true, farmEstate: true },
  });
  if (!plan) throw new AppError(404, "NOT_FOUND", "Activity plan not found.");
  if (plan.farmEstate?.termStartDate) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const windowStart = plan.election?.defaultWindowStart;
    if (windowStart && today < new Date(windowStart)) {
      throw new AppError(400, "INVALID_STATE", "Plan window has not started.");
    }
  }
  const existing = await prisma.supervisor_progress.findUnique({ where: { activityPlanId } });
  const movementChanged = !existing || existing.pctComplete !== pctComplete;
  const row = await prisma.supervisor_progress.upsert({
    where: { activityPlanId },
    create: {
      id: uuid("spr"),
      programId,
      activityPlanId,
      pctComplete,
      lastMovementDate: movementChanged ? lastMovementDate || new Date() : null,
      updatedByUserId: user.id,
    },
    update: {
      pctComplete,
      ...(movementChanged
        ? { lastMovementDate: lastMovementDate || new Date(), updatedByUserId: user.id }
        : {}),
    },
    include: {
      activityPlan: { include: { activity: true, block: true, election: true } },
    },
  });
  return serialize(row);
};
