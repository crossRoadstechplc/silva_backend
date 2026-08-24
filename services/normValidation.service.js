/**
 * Validate field ticket actuals against activity catalog norms.
 * Tolerances per DEV_HANDOFF_BUILD_PLAN Level 5.
 */
function pctVariance(actual, planned) {
  if (planned == null || planned === 0) return actual ? 100 : 0;
  return Math.abs(((actual - planned) / planned) * 100);
}

exports.validateAgainstCatalog = (catalog, dto) => {
  if (!catalog) return { ok: true, flags: [] };

  const flags = [];
  const qty = dto.actualQuantity != null ? Number(dto.actualQuantity) : null;
  const md = dto.actualMandays != null ? Number(dto.actualMandays) : null;
  const cost = dto.actualCostEtb != null ? Number(dto.actualCostEtb) : null;

  const plannedQty = catalog.annualQuantity != null ? Number(catalog.annualQuantity) / 12 : null;
  const plannedMd = catalog.annualMandays != null ? Number(catalog.annualMandays) / 12 : null;
  const plannedCost = catalog.annualCostEtb != null ? Number(catalog.annualCostEtb) / 12 : null;

  if (qty != null && plannedQty) {
    const v = pctVariance(qty, plannedQty);
    if (v > 10) flags.push({ code: "quantity_variance", variancePct: v, message: "Quantity outside ±10% of monthly plan." });
  }
  if (md != null && plannedMd) {
    const v = pctVariance(md, plannedMd);
    if (v > 15) flags.push({ code: "manday_variance", variancePct: v, message: "Mandays outside ±15% of norm." });
  }
  if (cost != null && plannedCost) {
    const v = pctVariance(cost, plannedCost);
    if (v > 10) flags.push({ code: "cost_variance", variancePct: v, message: "Cost outside ±10% of plan.", blockPayment: true });
  }

  return {
    ok: flags.length === 0,
    flags,
    planned: { quantity: plannedQty, mandays: plannedMd, costEtb: plannedCost },
    actual: { quantity: qty, mandays: md, costEtb: cost },
  };
};

exports.validatePayrollLine = (catalog, dto) => {
  const cost = dto.actualCostEtb != null ? Number(dto.actualCostEtb) : null;
  const planned = catalog.annualCostEtb != null ? Number(catalog.annualCostEtb) / 12 : null;
  const flags = [];
  if (cost != null && planned && pctVariance(cost, planned) > 5) {
    flags.push({ code: "payroll_variance", message: "Payroll amount differs from monthly plan." });
  }
  return { ok: flags.length === 0, flags };
};
