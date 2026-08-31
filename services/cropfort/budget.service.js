const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { laborCost, materialCost } = require("../costDerivation.service");
const { requireProgramId } = require("../utils/programScope");
const { isFarmOwner } = require("../../utils/cropfortRoles");

async function getApprovedRateByCode(programId) {
  const lines = await prisma.rate_card_lines.findMany({
    where: { programId, status: "approved" },
    orderBy: [{ resourceCode: "asc" }, { version: "desc" }],
  });
  const map = new Map();
  for (const line of lines) {
    if (!map.has(line.resourceCode)) {
      map.set(line.resourceCode, Number(line.rateEtb));
    }
  }
  return map;
}

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
      activity: true,
      block: { select: { id: true, code: true, label: true } },
    },
    orderBy: [{ blockId: "asc" }, { sequence: "asc" }],
  });

  const rows = [];
  let totalLabor = 0;
  let totalMaterial = 0;

  for (const line of lines) {
    if (!matchesMonth(line.plannedStart, query.budgetMonth)) continue;
    const rate = rateMap.get(line.activity.code) ?? 0;
    const labor = laborCost(line.plannedQty, line.activity.laborNorm, rate);
    const material = materialCost(line.plannedQty, line.activity.materialNorm, rate);
    totalLabor += labor;
    totalMaterial += material;
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
      plannedQty: Number(line.plannedQty),
      rateEtb: rate,
      laborCostEtb: Number(labor.toFixed(2)),
      materialCostEtb: Number(material.toFixed(2)),
      totalCostEtb: Number((labor + material).toFixed(2)),
    });
  }

  if (farmOwner) {
    return {
      rows: rows.map(({ rateEtb: _rate, ...rest }) => rest),
      totals: {
        laborCostEtb: Number(totalLabor.toFixed(2)),
        materialCostEtb: Number(totalMaterial.toFixed(2)),
        totalCostEtb: Number((totalLabor + totalMaterial).toFixed(2)),
      },
    };
  }

  return {
    rows,
    totals: {
      laborCostEtb: Number(totalLabor.toFixed(2)),
      materialCostEtb: Number(totalMaterial.toFixed(2)),
      totalCostEtb: Number((totalLabor + totalMaterial).toFixed(2)),
    },
  };
};
