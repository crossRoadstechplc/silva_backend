const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");

async function committedUsdForAfp(programId, afpLineId, excludeAfeId) {
  const where = {
    programId,
    afpLineId,
    status: { notIn: ["rejected"] },
  };
  if (excludeAfeId) where.id = { not: excludeAfeId };
  const afes = await prisma.afes.findMany({ where, select: { estimatedCostUsd: true } });
  return afes.reduce((sum, row) => sum + Number(row.estimatedCostUsd), 0);
}

async function assertAfpBudgetAvailable({ programId, afpLineId, additionalUsd, excludeAfeId }) {
  const afp = await prisma.afp_lines.findFirst({ where: { id: afpLineId, programId } });
  if (!afp) throw new AppError(404, "NOT_FOUND", "AFP line not found.");
  if (!["approved", "active"].includes(afp.status)) {
    throw new AppError(422, "BUSINESS_RULE_VIOLATION", "AFP line must be approved or active for planned spend.");
  }
  const committed = await committedUsdForAfp(programId, afpLineId, excludeAfeId);
  const budget = Number(afp.budgetAllocatedUsd);
  const next = committed + Number(additionalUsd);
  if (next > budget) {
    throw new AppError(
      422,
      "BUSINESS_RULE_VIOLATION",
      `AFE would exceed AFP budget envelope (${Math.round(next)} > ${Math.round(budget)} USD).`,
    );
  }
  const utilization = budget ? (next / budget) * 100 : 0;
  return { afp, committedUsd: committed, utilizationPercent: Math.round(utilization) };
}

module.exports = { committedUsdForAfp, assertAfpBudgetAvailable };
