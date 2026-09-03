const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { activityLineCosts } = require("../costDerivation.service");
const { getApprovedRateByCode } = require("./rateMap.service");
const cashFlowService = require("./cashFlow.service");
const { requireProgramId } = require("../utils/programScope");
const { isFarmOwner } = require("../../utils/cropfortRoles");

function monthKey(date) {
  if (!date) return null;
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function matchesMonth(plannedStart, budgetMonth) {
  if (!budgetMonth) return true;
  return monthKey(plannedStart) === budgetMonth;
}

exports.preview = async (user, query) => {
  const programId = requireProgramId(user);
  const farmOwner = await isFarmOwner(user.id, programId);

  if (query.farmEstateId && query.planYear) {
    const rollup = await cashFlowService.getBudgetRollup(user, query.farmEstateId, query.planYear);
    return {
      tier1ByBlock: rollup.tier1ByBlock,
      tier23FarmWide: rollup.tier23FarmWide,
      totals: {
        ...rollup.totals,
        totalCostEtb: Number(
          (rollup.totals.labor + rollup.totals.material + rollup.totals.service).toFixed(2),
        ),
        laborCostEtb: rollup.totals.labor,
        materialCostEtb: rollup.totals.material,
        serviceCostEtb: rollup.totals.service,
      },
      rows: rollup.tier1ByBlock,
    };
  }

  const rateMap = await getApprovedRateByCode(programId);

  const where = {
    programId,
    status: "approved",
    electionStatus: "elected",
  };
  if (query.planYear) where.planYear = Number(query.planYear);
  if (query.blockId) where.blockId = query.blockId;

  const lines = await prisma.afp_block_lines.findMany({
    where,
    include: {
      activity: { include: { template: true } },
      block: { select: { id: true, code: true, label: true, areaHa: true, treeCount: true } },
    },
    orderBy: [{ blockId: "asc" }, { sequence: "asc" }],
  });

  const rows = [];
  let totalLabor = 0;
  let totalMaterial = 0;
  let totalService = 0;

  for (const line of lines) {
    if (!matchesMonth(line.plannedStart, query.budgetMonth)) continue;
    const qty = Number(line.plannedQty);
    const costs = activityLineCosts(qty, line.activity, rateMap);
    totalLabor += costs.laborCostEtb;
    totalMaterial += costs.materialCostEtb;
    totalService += costs.serviceCostEtb;
    rows.push({
      programId,
      planYear: line.planYear,
      blockId: line.blockId,
      blockCode: line.block.code,
      blockLabel: line.block.label,
      activityId: line.activityId,
      activityCode: line.activity.code,
      activityName: line.activity.name,
      budgetMonth: monthKey(line.plannedStart),
      plannedQty: qty,
      laborCostEtb: costs.laborCostEtb,
      materialCostEtb: costs.materialCostEtb,
      serviceCostEtb: costs.serviceCostEtb,
      totalCostEtb: costs.totalCostEtb,
    });
  }

  const totals = {
    laborCostEtb: Number(totalLabor.toFixed(2)),
    materialCostEtb: Number(totalMaterial.toFixed(2)),
    serviceCostEtb: Number(totalService.toFixed(2)),
    totalCostEtb: Number((totalLabor + totalMaterial + totalService).toFixed(2)),
  };

  if (farmOwner) {
    return { rows, totals };
  }

  return { rows, totals };
};

exports.getApprovedRateByCode = getApprovedRateByCode;
