/**
 * Validate field ticket actuals against activity catalog norms.
 * Per DEV_HANDOFF Level 5:
 * - Mandays vs (qty × normMdPerUnit) ±15% — flag only
 * - Cost vs (MD × normWageEtb) ±10% — blocks submit / payment
 */
function pctVariance(actual, expected) {
  if (expected == null || expected === 0) return actual ? 100 : 0;
  return Math.abs(((actual - expected) / expected) * 100);
}

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function deriveWageEtb(catalog) {
  const wage = num(catalog.normWageEtb);
  if (wage != null && wage > 0) return wage;
  const annualMd = num(catalog.annualMandays);
  const annualCost = num(catalog.annualCostEtb);
  if (annualMd != null && annualMd > 0 && annualCost != null) {
    return annualCost / annualMd;
  }
  return null;
}

function expectedCostEtb(catalog, qty, md) {
  const wage = deriveWageEtb(catalog);
  if (md != null && wage != null) return md * wage;
  const unitCost = num(catalog.normCostEtb);
  if (qty != null && unitCost != null) return qty * unitCost;
  return null;
}

exports.validateAgainstCatalog = (catalog, dto) => {
  if (!catalog) return { ok: true, flags: [] };

  const flags = [];
  const qty = num(dto.actualQuantity);
  const md = num(dto.actualMandays);
  const cost = num(dto.actualCostEtb);
  const plannedQty = num(dto.plannedQuantity);
  const normMdPerUnit = num(catalog.normMdPerUnit);

  if (qty != null && plannedQty != null && plannedQty > 0) {
    const v = pctVariance(qty, plannedQty);
    if (v > 10) {
      flags.push({
        code: "quantity_variance",
        variancePct: v,
        message: "Quantity outside ±10% of planned.",
      });
    }
  }

  if (md != null && qty != null && normMdPerUnit != null && normMdPerUnit > 0) {
    const expectedMd = qty * normMdPerUnit;
    const v = pctVariance(md, expectedMd);
    if (v > 15) {
      flags.push({
        code: "manday_variance",
        variancePct: v,
        message: "Mandays outside ±15% of norm (qty × MD/unit).",
      });
    }
  }

  if (cost != null) {
    const expectedCost = expectedCostEtb(catalog, qty, md);
    if (expectedCost != null && expectedCost > 0) {
      const v = pctVariance(cost, expectedCost);
      if (v > 10) {
        flags.push({
          code: "cost_variance",
          variancePct: v,
          message: `Cost outside ±10% of expected (${Math.round(expectedCost)} ETB from norms).`,
          blockPayment: true,
        });
      }
    }
  }

  const expectedMd = qty != null && normMdPerUnit != null ? qty * normMdPerUnit : null;
  const expectedCost = expectedCostEtb(catalog, qty, md);

  return {
    ok: flags.length === 0,
    flags,
    planned: {
      quantity: plannedQty,
      mandays: expectedMd,
      costEtb: expectedCost,
    },
    actual: { quantity: qty, mandays: md, costEtb: cost },
  };
};

exports.validatePayrollLine = (catalog, dto) => {
  const cost = num(dto.actualCostEtb);
  const md = num(dto.actualMandays);
  const flags = [];
  const expected = catalog ? expectedCostEtb(catalog, null, md) : null;
  if (cost != null && expected != null && expected > 0 && pctVariance(cost, expected) > 5) {
    flags.push({ code: "payroll_variance", message: "Payroll amount differs from mandays × wage norm." });
  }
  return { ok: flags.length === 0, flags };
};
