const prisma = require("../../config/database");

/**
 * Resolve effective labor rate per farm+activity (spec §2.4 step 6, §2.5).
 */
async function resolveLaborRate(farmEstateId, activityId) {
  const approvedSurvey = await prisma.benchmark_surveys.findFirst({
    where: {
      farmEstateId,
      activityId,
      status: "approved",
      useNormWage: false,
      proposedRate: { not: null },
    },
    orderBy: { approvedAt: "desc" },
  });
  if (approvedSurvey?.proposedRate != null && Number(approvedSurvey.proposedRate) > 0) {
    return {
      rateEtb: Number(approvedSurvey.proposedRate),
      source: "benchmark",
      surveyId: approvedSurvey.id,
    };
  }

  const laborCard = await prisma.labor_rate_cards.findFirst({
    where: { farmEstateId, activityId, status: "approved" },
    orderBy: { version: "desc" },
  });
  if (laborCard) {
    const norm = laborCard.normMandayPerUnit != null ? Number(laborCard.normMandayPerUnit) : 0;
    const wage = laborCard.wageRatePerManday != null ? Number(laborCard.wageRatePerManday) : 0;
    if (norm > 0 && wage > 0) {
      return { rateEtb: norm * wage, source: "labor_card", laborCardId: laborCard.id };
    }
  }

  const activity = await prisma.activity_master.findUnique({ where: { id: activityId } });
  if (activity) {
    if (activity.laborCostPerUnit != null && Number(activity.laborCostPerUnit) > 0) {
      return { rateEtb: Number(activity.laborCostPerUnit), source: "template_default" };
    }
    const norm = activity.laborNorm != null ? Number(activity.laborNorm) : 0;
    const wage = activity.laborWageEtb != null ? Number(activity.laborWageEtb) : 0;
    if (norm > 0 && wage > 0) {
      return { rateEtb: norm * wage, source: "template_default" };
    }
  }

  return { rateEtb: 0, source: "none" };
}

async function resolveLaborRateMap(farmEstateId, activityIds) {
  const map = new Map();
  for (const activityId of activityIds) {
    map.set(activityId, await resolveLaborRate(farmEstateId, activityId));
  }
  return map;
}

module.exports = { resolveLaborRate, resolveLaborRateMap };
