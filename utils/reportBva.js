const { money } = require("./helpers");

function utilizationHealth(utilizationPercent) {
  if (utilizationPercent > 100) return "over_budget";
  if (utilizationPercent >= 85) return "watch";
  return "on_track";
}

/** Map legacy *Usd snapshot fields to ETB names used by the client. */
function normalizeBvaRow(row) {
  if (!row || typeof row !== "object") return null;
  const budgetRaw = row.budgetAllocatedEtb ?? row.budgetAllocatedUsd ?? null;
  const plannedRaw = row.plannedEtb ?? row.plannedUsd ?? null;
  const committedRaw = row.committedEtb ?? row.committedUsd ?? 0;
  const actualRaw = row.actualEtb ?? row.actualUsd ?? 0;
  const budget = budgetRaw != null ? Number(budgetRaw) : 0;
  const actual = Number(actualRaw) || 0;
  const utilization =
    row.utilizationPercent != null
      ? Number(row.utilizationPercent)
      : budget
        ? Math.round((actual / budget) * 100)
        : 0;
  return {
    afpLineId: row.afpLineId,
    activity: row.activity,
    budgetAllocatedEtb: budgetRaw != null ? money(budgetRaw) : 0,
    plannedEtb: plannedRaw != null ? money(plannedRaw) : budgetRaw != null ? money(budgetRaw) : 0,
    committedEtb: money(committedRaw) ?? 0,
    actualEtb: money(actualRaw) ?? 0,
    utilizationPercent: utilization,
    health: row.health || utilizationHealth(utilization),
  };
}

function normalizeBvaPayload(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.map(normalizeBvaRow).filter(Boolean);
}

function sectionsFromRow(row) {
  if (!row?.sections || typeof row.sections !== "object") return [];
  return Object.entries(row.sections).map(([key, payload]) => ({
    key,
    title: key.replace(/_/g, " "),
    payload: key === "budget_vs_actual" ? normalizeBvaPayload(payload) : payload,
  }));
}

function summarizeBvaRows(rows) {
  if (!rows?.length) return null;
  const budget = rows.reduce((s, r) => s + (r.budgetAllocatedEtb ?? 0), 0);
  const committed = rows.reduce((s, r) => s + (r.committedEtb ?? 0), 0);
  const actual = rows.reduce((s, r) => s + (r.actualEtb ?? 0), 0);
  const utilization = budget ? Math.round((actual / budget) * 100) : 0;
  return { budget, committed, actual, utilization, lineCount: rows.length };
}

function formatEtbAmount(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `ETB ${Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

module.exports = {
  normalizeBvaRow,
  normalizeBvaPayload,
  sectionsFromRow,
  summarizeBvaRows,
  formatEtbAmount,
};
