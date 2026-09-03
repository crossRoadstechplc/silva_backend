const AppError = require("../utils/AppError");

const COMPUTED_RATE_FIELDS = new Set([
  "variancePct",
  "variance_pct",
  "isFlagged",
  "is_flagged",
  "laborCost",
  "materialCost",
  "band",
]);

const HA_UOMS = new Set(["ha", "hectare", "hectares"]);
const TREE_UOMS = new Set(["no", "tree", "trees", "number"]);

function benchmarkAverage(benchmarkA, benchmarkB) {
  const a = benchmarkA != null ? Number(benchmarkA) : null;
  const b = benchmarkB != null ? Number(benchmarkB) : null;
  if (a != null && b != null) return (a + b) / 2;
  if (a != null) return a;
  if (b != null) return b;
  return null;
}

function computeVariancePct(rate, benchmarkA, benchmarkB) {
  const avg = benchmarkAverage(benchmarkA, benchmarkB);
  if (avg == null || avg === 0) return null;
  const r = Number(rate);
  return Number((((r - avg) / avg) * 100).toFixed(2));
}

function computeIsFlagged(variancePct, thresholdPct) {
  if (variancePct == null) return false;
  return Math.abs(Number(variancePct)) > Number(thresholdPct);
}

function rejectClientComputedFields(body) {
  if (!body || typeof body !== "object") return;
  for (const key of Object.keys(body)) {
    if (COMPUTED_RATE_FIELDS.has(key)) {
      throw new AppError(400, "VALIDATION_ERROR", `Field '${key}' is computed server-side and cannot be supplied.`);
    }
  }
}

function laborCost(qty, norm, rate) {
  return Number(qty) * Number(norm || 0) * Number(rate);
}

function materialCost(qty, norm, rate) {
  return Number(qty) * Number(norm || 0) * Number(rate);
}

function serviceCost(qty, norm, rate) {
  return Number(qty) * Number(norm || 0) * Number(rate);
}

function normalizeUom(uom) {
  return String(uom || "")
    .trim()
    .toLowerCase()
    .replace(/,/g, "");
}

function resolveQty(block, activityUom, estate) {
  const uom = normalizeUom(activityUom);
  if (HA_UOMS.has(uom)) {
    if (block?.areaHa != null) return Number(block.areaHa);
    if (estate?.totalAreaHa != null) return Number(estate.totalAreaHa);
    return 0;
  }
  if (TREE_UOMS.has(uom) || uom.includes("tree")) {
    if (block?.treeCount != null) return Number(block.treeCount);
    return 0;
  }
  if (block?.areaHa != null) return Number(block.areaHa);
  if (estate?.totalAreaHa != null) return Number(estate.totalAreaHa);
  return 1;
}

function activityLaborUnitCost(activity) {
  const piece = activity?.laborCostPerUnit != null ? Number(activity.laborCostPerUnit) : null;
  if (piece != null && piece > 0) return piece;
  const norm = activity?.laborNorm != null ? Number(activity.laborNorm) : 0;
  const wage = activity?.laborWageEtb != null ? Number(activity.laborWageEtb) : 0;
  if (norm > 0 && wage > 0) return norm * wage;
  return 0;
}

function hasLaborCosting(activity) {
  if (!activity) return false;
  if (activity.laborCostPerUnit != null && Number(activity.laborCostPerUnit) > 0) return true;
  const norm = activity.laborNorm != null ? Number(activity.laborNorm) : 0;
  const wage = activity.laborWageEtb != null ? Number(activity.laborWageEtb) : 0;
  return norm > 0 && wage > 0;
}

function activityLineCosts(qty, activity, rateMap) {
  const q = Number(qty || 0);
  let labor = 0;
  let material = 0;
  let service = 0;
  const warnings = [];

  if (hasLaborCosting(activity)) {
    const unitLabor = activityLaborUnitCost(activity);
    labor = q * unitLabor;
  } else if (activity?.laborNorm != null && Number(activity.laborNorm) > 0) {
    warnings.push(`Activity ${activity.code} has labor norm but no wage or piece rate.`);
  }

  const materialNorm = activity?.materialNorm != null ? Number(activity.materialNorm) : 0;
  const materialCode = activity?.materialRateCode?.trim();
  if (materialNorm > 0) {
    if (!materialCode) {
      warnings.push(`Activity ${activity.code} has material norm but no material rate code.`);
    } else {
      const rate = rateMap.get(materialCode) ?? 0;
      if (rate <= 0) warnings.push(`No approved rate for material ${materialCode}.`);
      material = materialCost(q, materialNorm, rate);
    }
  }

  const serviceNorm = activity?.serviceNorm != null ? Number(activity.serviceNorm) : 0;
  const serviceCode = activity?.serviceRateCode?.trim();
  if (serviceNorm > 0) {
    if (!serviceCode) {
      warnings.push(`Activity ${activity.code} has service norm but no service rate code.`);
    } else {
      const rate = rateMap.get(serviceCode) ?? 0;
      if (rate <= 0) warnings.push(`No approved rate for service ${serviceCode}.`);
      service = serviceCost(q, serviceNorm, rate);
    }
  }

  return {
    laborCostEtb: Number(labor.toFixed(2)),
    materialCostEtb: Number(material.toFixed(2)),
    serviceCostEtb: Number(service.toFixed(2)),
    totalCostEtb: Number((labor + material + service).toFixed(2)),
    warnings,
  };
}

function enrichRateCardLine(line, thresholdPct) {
  const variancePct = computeVariancePct(line.rateEtb, line.benchmarkFarmARate, line.benchmarkFarmBRate);
  const isFlagged = computeIsFlagged(variancePct, thresholdPct);
  return { ...line, variancePct, isFlagged };
}

function computeCropfortAfeBand(amountEtb, program) {
  const amount = Number(amountEtb);
  const bandA = Number(program?.cropfortAfeBandAMaxEtb ?? 500000);
  const bandB = Number(program?.cropfortAfeBandBMaxEtb ?? 2000000);
  const bandC = Number(program?.cropfortAfeBandCMaxEtb ?? 5000000);
  if (amount <= bandA) return "A";
  if (amount <= bandB) return "B";
  if (amount <= bandC) return "C";
  return "D";
}

module.exports = {
  benchmarkAverage,
  computeVariancePct,
  computeIsFlagged,
  rejectClientComputedFields,
  laborCost,
  materialCost,
  serviceCost,
  resolveQty,
  activityLaborUnitCost,
  hasLaborCosting,
  activityLineCosts,
  enrichRateCardLine,
  computeCropfortAfeBand,
};
