const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const DEFAULT_FX = 130;

const CATEGORY_DEFS = [
  { afpLineId: "AFP-2026-001", discipline: "Agronomic Operations", activity: "Nursery program — 60,000 seedlings", kpi: "Seedling survival ≥85%" },
  { afpLineId: "AFP-2026-002", discipline: "Agronomic Operations", activity: "Young coffee care — Blocks A–G", kpi: "Cover crop compliance 100%" },
  { afpLineId: "AFP-2026-003", discipline: "Agronomic Operations", activity: "Mature coffee maintenance — 129 ha", kpi: "Pruning completion per schedule" },
  { afpLineId: "AFP-2026-004", discipline: "Agronomic Operations", activity: "Infilling program — 48,000 trees", kpi: "Infilling survival ≥80%" },
  { afpLineId: "AFP-2026-005", discipline: "Harvest & Post-Harvest", activity: "Harvest campaign — cherry to hulling", kpi: "Yield ≥350 kg/ha green bean" },
  { afpLineId: "AFP-2026-006", discipline: "Procurement & Supply Chain", activity: "Material cost — agronomic & harvest inputs", kpi: "Input application per protocol" },
  { afpLineId: "AFP-2026-008", discipline: "Infrastructure & Capital Works", activity: "Site construction", kpi: "Completion by Q2" },
  { afpLineId: "AFP-2026-009", discipline: "Admin & Compliance", activity: "Office equipment", kpi: "Operational by Q1" },
  { afpLineId: "AFP-2026-010", discipline: "Labor & Payroll", activity: "Farm staff payroll — Silva EOR", kpi: "Payroll accuracy 100%" },
];

const BUDGET_MONTHS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function etbToUsd(etb, fx) {
  return round2(etb / fx);
}

function loadReferencePlan() {
  const refPath = path.join(__dirname, "..", "prisma", "seed", "bagro", "agronomy.json");
  if (!fs.existsSync(refPath)) return { sections: [] };
  return JSON.parse(fs.readFileSync(refPath, "utf8"));
}

function buildDefaultParsed(fx = DEFAULT_FX) {
  const ref = loadReferencePlan();
  const categories = CATEGORY_DEFS.map((c) => ({
    afpLineId: c.afpLineId,
    operatingDiscipline: c.discipline,
    activity: c.activity,
    kpiTarget: c.kpi,
    budgetEtb: 0,
    budgetUsd: 0,
    monthlySchedule: BUDGET_MONTHS.map((month) => ({ month, plannedCostEtb: 0 })),
  }));

  const sections = (ref.sections || []).map((s) => ({
    sectionCode: s.sectionCode,
    sectionLabel: s.sectionLabel,
    afpLineId: s.afpLineId,
    scope: s.scope || null,
    activities: (s.activities || []).map((a) => ({
      id: a.id,
      nameEn: a.nameEn,
      nameAm: a.nameAm || null,
      unit: a.unit,
      normMdPerUnit: a.normMdPerUnit ?? null,
      normWageEtb: a.normWageEtb ?? null,
      normsPerMd: a.normsPerMd ?? null,
      annualQuantity: a.annualQuantity ?? null,
      annualMandays: a.annualMandays ?? null,
      annualCostEtb: a.annualCostEtb ?? null,
      schedule: a.schedule || [],
    })),
  }));

  for (const section of sections) {
    const cat = categories.find((c) => c.afpLineId === section.afpLineId);
    if (!cat) continue;
    const sectionTotal = section.activities.reduce((s, a) => s + (a.annualCostEtb || 0), 0);
    cat.budgetEtb = round2(sectionTotal);
    cat.budgetUsd = etbToUsd(cat.budgetEtb, fx);
  }

  const salaryLines = [
    { id: "PAY-01", nameEn: "Permanent salary", unit: "month", annualCostEtb: 1378177, normWageEtb: 114848 },
    { id: "PAY-02", nameEn: "Contractual salary", unit: "month", annualCostEtb: 549953, normWageEtb: 45829 },
    { id: "PAY-03", nameEn: "Pension (11%)", unit: "month", annualCostEtb: 175224, normWageEtb: 14602 },
    { id: "PAY-04", nameEn: "Petty cash", unit: "month", annualCostEtb: 12240, normWageEtb: 1020 },
    { id: "PAY-05", nameEn: "Per diem", unit: "month", annualCostEtb: 72000, normWageEtb: 6000 },
    { id: "PAY-06", nameEn: "Mobile card & photocopy", unit: "month", annualCostEtb: 19800, normWageEtb: 1650 },
    { id: "PAY-07", nameEn: "Fuel & lubricant", unit: "month", annualCostEtb: 84000, normWageEtb: 7000 },
    { id: "PAY-08", nameEn: "Medical expense", unit: "month", annualCostEtb: 78000, normWageEtb: 6500 },
    { id: "PAY-09", nameEn: "Bonus (one month)", unit: "month", annualCostEtb: 146020, normWageEtb: null, schedule: [{ month: 9, plannedCostEtb: 146020 }] },
    { id: "PAY-10", nameEn: "Land use tax", unit: "month", annualCostEtb: 64875, normWageEtb: null, schedule: [{ month: 3, plannedCostEtb: 64875 }] },
  ];

  const salaryTotal = salaryLines.reduce((s, l) => s + l.annualCostEtb, 0);
  const salaryCat = categories.find((c) => c.afpLineId === "AFP-2026-010");
  if (salaryCat) {
    salaryCat.budgetEtb = salaryTotal;
    salaryCat.budgetUsd = etbToUsd(salaryTotal, fx);
    salaryCat.monthlySchedule = BUDGET_MONTHS.map((month) => ({
      month,
      plannedCostEtb: round2(salaryTotal / 12),
    }));
  }

  sections.push({
    sectionCode: "salary",
    sectionLabel: "Salary & Admin",
    afpLineId: "AFP-2026-010",
    scope: null,
    activities: salaryLines.map((l) => ({
      id: l.id,
      nameEn: l.nameEn,
      nameAm: null,
      unit: l.unit,
      normMdPerUnit: null,
      normWageEtb: l.normWageEtb,
      normsPerMd: null,
      annualQuantity: l.normWageEtb ? 12 : 1,
      annualMandays: 0,
      annualCostEtb: l.annualCostEtb,
      schedule: l.schedule || (l.normWageEtb ? BUDGET_MONTHS.map((month) => ({ month, costEtb: l.normWageEtb })) : l.schedule),
    })),
  });

  return {
    source: "Coffee Field OS work plan template",
    fxEtbPerUsd: fx,
    categories,
    sections,
    salaryLines,
    grandTotalEtb: round2(categories.reduce((s, c) => s + c.budgetEtb, 0)),
  };
}

/** Blank draft for B-Agro to fill via form or Excel — no pre-loaded Chetu Farm numbers. */
function buildEmptyParsed(fx = DEFAULT_FX, meta = {}) {
  return {
    source: "Coffee Field OS form builder",
    inputMethod: "form",
    fxEtbPerUsd: fx,
    farmEstateId: meta.farmEstateId || null,
    farmName: meta.farmName || null,
    totalAreaHa: meta.totalAreaHa ?? null,
    categories: [],
    sections: [],
    salaryLines: [],
    grandTotalEtb: 0,
    reconciliation: {
      categoryTotalEtb: 0,
      activityTotalEtb: 0,
      salaryTotalEtb: 0,
      balanced: true,
    },
  };
}

function parseSummarySheet(rows, fx) {
  const categories = [];
  for (const row of rows) {
    const label = String(row[0] || row["Cost Category"] || row.category || "").trim();
    const etb = num(row[1] ?? row["Total Cost"] ?? row.totalCostEtb ?? row.etb);
    const afpLineId = String(row.afpLineId || row["AFP ID"] || "").trim();
    if (!label && !afpLineId) continue;
    if (!etb && etb !== 0) continue;
    const def = CATEGORY_DEFS.find((d) => d.afpLineId === afpLineId) ||
      CATEGORY_DEFS.find((d) => label.toLowerCase().includes(d.activity.split("—")[0].trim().toLowerCase().slice(0, 12)));
    if (!def && !afpLineId) continue;
    categories.push({
      afpLineId: afpLineId || def?.afpLineId,
      operatingDiscipline: def?.discipline || "Operations",
      activity: label || def?.activity,
      kpiTarget: def?.kpi || "Per submitted plan",
      budgetEtb: etb,
      budgetUsd: etbToUsd(etb, fx),
      monthlySchedule: [],
    });
  }
  return categories;
}

function parseMonthlySheet(rows, categories, fx) {
  if (!rows.length) return categories;
  const header = rows[0];
  const monthCols = [];
  for (let i = 0; i < (header?.length || 0); i++) {
    const h = String(header[i] || "").toLowerCase();
    const monthMap = {
      oct: 10, octob: 10, nov: 11, novm: 11, dec: 12, decem: 12,
      jan: 1, janw: 1, feb: 2, febur: 2, mar: 3, marc: 3,
      apr: 4, apri: 4, may: 5, jun: 6, jul: 7, jula: 7, aug: 8, auge: 8, sep: 9, sept: 9,
    };
    for (const [key, month] of Object.entries(monthMap)) {
      if (h.includes(key)) {
        monthCols.push({ idx: i, month });
        break;
      }
    }
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const label = String(row[0] || row[1] || "").trim();
    if (!label || label.toLowerCase().includes("total")) continue;
    const cat = categories.find(
      (c) =>
        label.toLowerCase().includes(c.activity.toLowerCase().slice(0, 10)) ||
        label.toLowerCase().includes(c.afpLineId?.toLowerCase() || "___"),
    );
    if (!cat) continue;
    cat.monthlySchedule = monthCols
      .map(({ idx, month }) => ({
        month,
        plannedCostEtb: num(row[idx]) || 0,
        plannedCostUsd: etbToUsd(num(row[idx]) || 0, fx),
      }))
      .filter((m) => m.plannedCostEtb > 0);
  }
  return categories;
}

function parseActivitySheet(rows, sectionMeta) {
  const activities = [];
  for (const row of rows) {
    const id = String(row.id || row[0] || row.Code || row.code || "").trim();
    if (!id || id.toLowerCase() === "code") continue;
    const nameEn = String(row.nameEn || row[1] || row.Activity || row.activity || id).trim();
    activities.push({
      id,
      nameEn,
      nameAm: row.nameAm || row[2] || null,
      unit: String(row.unit || row[3] || row.Unit || "unit").trim(),
      normMdPerUnit: num(row.normMdPerUnit ?? row["MD/unit"] ?? row.mdPerUnit),
      normWageEtb: num(row.normWageEtb ?? row["Wage ETB"] ?? row.wageEtb),
      normsPerMd: num(row.normsPerMd ?? row["Units/MD"]),
      annualQuantity: num(row.annualQuantity ?? row.Quantity ?? row.qty),
      annualMandays: num(row.annualMandays ?? row.Mandays ?? row.md),
      annualCostEtb: num(row.annualCostEtb ?? row["Cost ETB"] ?? row.costEtb),
      schedule: Array.isArray(row.schedule) ? row.schedule : [],
    });
  }
  return {
    sectionCode: sectionMeta.sectionCode,
    sectionLabel: sectionMeta.sectionLabel,
    afpLineId: sectionMeta.afpLineId,
    scope: sectionMeta.scope || null,
    activities,
  };
}

const SECTION_SHEETS = [
  { sheet: "Nursery", sectionCode: "nursery", sectionLabel: "I. Nursery Operations", afpLineId: "AFP-2026-001" },
  { sheet: "Young Coffee", sectionCode: "young_coffee", sectionLabel: "II. Young Coffee Care", afpLineId: "AFP-2026-002" },
  { sheet: "Mature Coffee", sectionCode: "matured_coffee", sectionLabel: "III. Mature Coffee Main Care", afpLineId: "AFP-2026-003" },
  { sheet: "Infilling", sectionCode: "infilling", sectionLabel: "IV. Infilling Operations", afpLineId: "AFP-2026-004" },
  { sheet: "Harvest", sectionCode: "harvest", sectionLabel: "V & VI. Harvest & Processing", afpLineId: "AFP-2026-005" },
  { sheet: "Materials", sectionCode: "materials", sectionLabel: "Materials", afpLineId: "AFP-2026-006" },
  { sheet: "Salary", sectionCode: "salary", sectionLabel: "Salary & Admin", afpLineId: "AFP-2026-010" },
];

function parseSalarySheet(rows) {
  const lines = [];
  for (const row of rows) {
    const code = String(row.code || row[0] || row.Code || "").trim();
    if (!code.startsWith("PAY-")) continue;
    const annualEtb = num(row.annualCostEtb ?? row.annualEtb ?? row[2]);
    const monthlyEtb = num(row.monthlyEtb ?? row[3]);
    lines.push({
      id: code,
      nameEn: String(row.nameEn || row[1] || row.activity || code).trim(),
      unit: "month",
      annualCostEtb: annualEtb,
      normWageEtb: monthlyEtb,
      schedule: monthlyEtb
        ? BUDGET_MONTHS.filter((m) => !(code === "PAY-09" && m !== 9) && !(code === "PAY-10" && m !== 3)).map(
            (month) => ({
              month,
              plannedCostEtb: code === "PAY-09" && month === 9 ? annualEtb : code === "PAY-10" && month === 3 ? annualEtb : monthlyEtb,
            }),
          )
        : [{ month: code === "PAY-09" ? 9 : 3, plannedCostEtb: annualEtb }],
    });
  }
  return lines;
}

function reconcileTotals(parsed) {
  const activityTotal = parsed.sections.reduce(
    (s, sec) => s + sec.activities.reduce((a, act) => a + (act.annualCostEtb || 0), 0),
    0,
  );
  const categoryTotal = parsed.categories.reduce((s, c) => s + (c.budgetEtb || 0), 0);
  const salaryTotal = (parsed.salaryLines || []).reduce((s, l) => s + (l.annualCostEtb || 0), 0);
  parsed.grandTotalEtb = round2(Math.max(categoryTotal, activityTotal + salaryTotal));
  parsed.reconciliation = {
    categoryTotalEtb: round2(categoryTotal),
    activityTotalEtb: round2(activityTotal),
    salaryTotalEtb: round2(salaryTotal),
    balanced: Math.abs(categoryTotal - (activityTotal + salaryTotal)) < 1 || categoryTotal === 0,
  };
  return parsed;
}

exports.parseJsonPayload = (payload, fx = DEFAULT_FX) => {
  const parsed = {
    source: payload.source || "JSON upload",
    fxEtbPerUsd: payload.fxEtbPerUsd || fx,
    categories: payload.categories || [],
    sections: payload.sections || [],
    salaryLines: payload.salaryLines || [],
  };
  if (parsed.sections.length) {
    parsed.categories = CATEGORY_DEFS.map((def) => {
      const matching = parsed.sections.filter((s) => s.afpLineId === def.afpLineId);
      const budgetEtb = matching.reduce(
        (s, sec) => s + sec.activities.reduce((a, act) => a + (act.annualCostEtb || 0), 0),
        0,
      );
      return {
        afpLineId: def.afpLineId,
        operatingDiscipline: def.discipline,
        activity: def.activity,
        kpiTarget: def.kpi,
        budgetEtb: round2(budgetEtb),
        budgetUsd: etbToUsd(budgetEtb, parsed.fxEtbPerUsd),
        monthlySchedule: [],
      };
    }).filter((c) => c.budgetEtb > 0);
  }
  return reconcileTotals(parsed);
};

exports.parseExcelBuffer = (buffer, fx = DEFAULT_FX) => {
  const wb = XLSX.read(buffer, { type: "buffer" });
  let categories = [];
  let sections = [];
  let salaryLines = [];

  if (wb.Sheets.Summary) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Summary, { header: 1, defval: "" });
    categories = parseSummarySheet(rows, fx);
  } else if (wb.Sheets.summary) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.summary, { header: 1, defval: "" });
    categories = parseSummarySheet(rows, fx);
  }

  const monthlySheet = wb.Sheets.Monthly || wb.Sheets.monthly;
  if (monthlySheet && categories.length) {
    const rows = XLSX.utils.sheet_to_json(monthlySheet, { header: 1, defval: "" });
    categories = parseMonthlySheet(rows, categories, fx);
  }

  for (const meta of SECTION_SHEETS) {
    const sheet = wb.Sheets[meta.sheet];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) continue;
    if (meta.sheet === "Salary") {
      salaryLines = parseSalarySheet(rows);
      sections.push({
        ...meta,
        activities: salaryLines.map((l) => ({
          ...l,
          nameAm: null,
          normMdPerUnit: null,
          normsPerMd: null,
          annualQuantity: l.schedule?.length || 12,
          annualMandays: 0,
        })),
      });
    } else {
      sections.push(parseActivitySheet(rows, meta));
    }
  }

  if (!sections.length && !categories.length) {
    return exports.parseJsonPayload(loadReferencePlan(), fx);
  }

  if (!categories.length && sections.length) {
    categories = CATEGORY_DEFS.map((def) => {
      const matching = sections.filter((s) => s.afpLineId === def.afpLineId);
      const budgetEtb = matching.reduce(
        (s, sec) => s + sec.activities.reduce((a, act) => a + (act.annualCostEtb || 0), 0),
        0,
      );
      return {
        afpLineId: def.afpLineId,
        operatingDiscipline: def.discipline,
        activity: def.activity,
        kpiTarget: def.kpi,
        budgetEtb: round2(budgetEtb),
        budgetUsd: etbToUsd(budgetEtb, fx),
        monthlySchedule: [],
      };
    }).filter((c) => c.budgetEtb > 0);
  }

  return reconcileTotals({
    source: "Excel upload",
    fxEtbPerUsd: fx,
    categories,
    sections,
    salaryLines,
  });
};

exports.buildTemplateParsed = buildDefaultParsed;
exports.buildEmptyParsed = buildEmptyParsed;
exports.getTemplate = () => {
  const ref = loadReferencePlan();
  const salaryTemplate = buildDefaultParsed();
  return {
    farmBlocks: [],
    budgetYears: [
      { label: "2017/18 EC (2024/25 GC)", gc: 2025 },
      { label: "2018/19 EC (2025/26 GC)", gc: 2026 },
      { label: "2019/20 EC (2026/27 GC)", gc: 2027 },
      { label: "2020/21 EC (2027/28 GC)", gc: 2028 },
    ],
    categories: CATEGORY_DEFS,
    budgetMonths: BUDGET_MONTHS,
    sections: ref.sections || [],
    salarySection: salaryTemplate.sections.find((s) => s.sectionCode === "salary") || null,
    salaryLines: salaryTemplate.salaryLines || [],
  };
};
exports.CATEGORY_DEFS = CATEGORY_DEFS;
exports.BUDGET_MONTHS = BUDGET_MONTHS;
