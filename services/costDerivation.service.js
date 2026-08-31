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
  enrichRateCardLine,
  computeCropfortAfeBand,
};
