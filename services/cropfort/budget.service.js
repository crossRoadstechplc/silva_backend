const prisma = require("../../config/database");
const { activityLineCosts } = require("../costDerivation.service");
const { getApprovedRateByCode } = require("./rateMap.service");
const { resolveLaborRate } = require("./resolveLaborRate.service");
const cashFlowService = require("./cashFlow.service");
const { requireProgramId } = require("../utils/programScope");

function monthKey(date) {
  if (!date) return null;
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function matchesMonth(plannedStart, budgetMonth) {
  if (!budgetMonth) return true;
  return monthKey(plannedStart) === budgetMonth;
}

async function costForAfpBlockLine(line, programId) {
  const farmEstateId = line.block?.farmEstateId || null;
  const rateMap = await getApprovedRateByCode(programId, farmEstateId);
  let activityForCost = line.activity;
  if (farmEstateId && line.activityId) {
    const labor = await resolveLaborRate(farmEstateId, line.activityId);
    if (labor.rateEtb > 0) {
      activityForCost = {
        ...line.activity,
        laborCostPerUnit: labor.rateEtb,
        laborNorm: null,
        laborWageEtb: null,
      };
    }
  }
  const qty = Number(line.plannedQty);
  const costs = activityLineCosts(qty, activityForCost, rateMap);
  return { qty, costs, farmEstateId };
}

exports.costForAfpBlockLine = costForAfpBlockLine;

exports.preview = async (user, query) => {
  const programId = requireProgramId(user);

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

  const where = {
    programId,
    status: "approved",
  };
  // Default budget = elected only (annual program). Commitments can request all approved.
  if (!(query.includeAllApproved === "true" || query.includeAllApproved === true)) {
    where.electionStatus = "elected";
  }
  if (query.planYear) where.planYear = Number(query.planYear);
  if (query.blockId) where.blockId = query.blockId;

  const lines = await prisma.afp_block_lines.findMany({
    where,
    include: {
      activity: { include: { template: true } },
      block: {
        select: { id: true, code: true, label: true, areaHa: true, treeCount: true, farmEstateId: true },
      },
    },
    orderBy: [{ blockId: "asc" }, { sequence: "asc" }],
  });

  const rows = [];
  let totalLabor = 0;
  let totalMaterial = 0;
  let totalService = 0;

  for (const line of lines) {
    if (!matchesMonth(line.plannedStart, query.budgetMonth)) continue;
    const { qty, costs } = await costForAfpBlockLine(line, programId);
    totalLabor += costs.laborCostEtb;
    totalMaterial += costs.materialCostEtb;
    totalService += costs.serviceCostEtb;
    rows.push({
      programId,
      planYear: line.planYear,
      lineId: line.id,
      blockId: line.blockId,
      blockCode: line.block.code,
      blockLabel: line.block.label,
      activityId: line.activityId,
      activityCode: line.activity.code,
      activityName: line.activity.name,
      electionStatus: line.electionStatus,
      budgetMonth: monthKey(line.plannedStart),
      plannedQty: qty,
      laborCostEtb: costs.laborCostEtb,
      materialCostEtb: costs.materialCostEtb,
      serviceCostEtb: costs.serviceCostEtb,
      totalCostEtb: costs.totalCostEtb,
      warnings: costs.warnings,
    });
  }

  const totals = {
    laborCostEtb: Number(totalLabor.toFixed(2)),
    materialCostEtb: Number(totalMaterial.toFixed(2)),
    serviceCostEtb: Number(totalService.toFixed(2)),
    totalCostEtb: Number((totalLabor + totalMaterial + totalService).toFixed(2)),
  };

  return { rows, totals };
};

exports.getApprovedRateByCode = getApprovedRateByCode;
