const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const AppError = require("../utils/AppError");

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
  const n = Number(String(v).replace(/,/g, "").replace(/\s/g, ""));
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

function sheetNames(wb) {
  return wb.SheetNames || [];
}

/** Find a sheet by exact name or loose alias match (prefer longest / exact). */
function findSheet(wb, aliases) {
  const names = sheetNames(wb);
  const normalized = aliases
    .map((a) => String(a).toLowerCase().trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const name of names) {
    const n = name.toLowerCase().trim();
    if (normalized.includes(n)) return { name, sheet: wb.Sheets[name] };
  }

  let best = null;
  let bestScore = 0;
  for (const name of names) {
    const n = name.toLowerCase().trim();
    for (const a of normalized) {
      if (a.length < 4 && a !== n) continue; // ignore short aliases like "young" unless exact
      if (n.includes(a) || (a.length >= 8 && a.includes(n))) {
        const score = a.length;
        if (score > bestScore) {
          bestScore = score;
          best = { name, sheet: wb.Sheets[name] };
        }
      }
    }
  }
  return best;
}

function sectionMetaByCode(sectionCode) {
  return SECTION_SHEETS.find((s) => s.sectionCode === sectionCode) || null;
}

function inferSectionFromSheetName(name) {
  const n = String(name || "")
    .toLowerCase()
    .trim();
  if (!n) return null;
  let best = null;
  let bestScore = 0;
  for (const meta of SECTION_SHEETS) {
    const aliases = [meta.sheet, ...(meta.aliases || [])].map((a) => a.toLowerCase());
    for (const a of aliases) {
      if (a.length < 4 && a !== n) continue;
      if (n === a || n.includes(a)) {
        const score = a.length;
        if (score > bestScore) {
          bestScore = score;
          best = meta;
        }
      }
    }
  }
  return best;
}

function categoriesFromSections(sections, fx) {
  return CATEGORY_DEFS.map((def) => {
    const matching = sections.filter((s) => s.afpLineId === def.afpLineId);
    const budgetEtb = matching.reduce(
      (s, sec) => s + (sec.activities || []).reduce((a, act) => a + (act.annualCostEtb || 0), 0),
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

/** Merge a newly parsed upload into an existing plan, replacing only overlapping sections. */
exports.mergeParsedUpload = (existing, incoming, fx = DEFAULT_FX) => {
  const prev = existing && typeof existing === "object" ? existing : {};
  const byCode = new Map((prev.sections || []).map((s) => [s.sectionCode, s]));
  for (const s of incoming.sections || []) {
    if (s?.sectionCode) byCode.set(s.sectionCode, s);
  }
  const sections = [...byCode.values()].filter((s) => (s.activities || []).length > 0);
  const salaryLines =
    incoming.sections?.some((s) => s.sectionCode === "salary")
      ? incoming.salaryLines || []
      : prev.salaryLines || incoming.salaryLines || [];
  const categories = categoriesFromSections(sections, fx);
  return reconcileTotals({
    source: incoming.source || "Excel upload",
    inputMethod: "excel",
    matchedSheets: incoming.matchedSheets || [],
    workbookSheets: incoming.workbookSheets || [],
    selectedSectionCode: incoming.selectedSectionCode || null,
    fxEtbPerUsd: fx,
    categories,
    sections,
    salaryLines,
    farmName: prev.farmName,
    totalAreaHa: prev.totalAreaHa,
    budgetYearLabel: prev.budgetYearLabel,
    budgetYearGc: prev.budgetYearGc,
  });
};

function cellText(v) {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function looksLikeActivityName(text) {
  if (!text || text.length < 3) return false;
  const lower = text.toLowerCase();
  if (/^(sub\s*total|total|grand|አጠቃላይ|ጉልበት|ከፍያ|quantity|manday|cost|no\.?$|ተ\.?ቁ)/i.test(lower)) {
    return false;
  }
  if (/^\d+(\.\d+)?$/.test(text)) return false;
  return /[a-zA-Z\u1200-\u137F]/.test(text);
}

function detectMatrixColumns(headerRows) {
  const flat = headerRows.flatMap((row) =>
    (row || []).map((cell, cIdx) => ({ cIdx, text: cellText(cell).toLowerCase() })),
  );
  const findCol = (...needles) => {
    for (const needle of needles) {
      const hit = flat.find((c) => c.text.includes(needle));
      if (hit) return hit.cIdx;
    }
    return null;
  };
  return {
    activityCol: findCol("activit", "የሥራ", "work") ?? 1,
    unitCol: findCol("unit", "መለኪያ") ?? 2,
    qtyCol: findCol("annual plan quantity", "plan quantity", "annual qty"),
    mdCol: findCol("annual plan md", "plan md"),
    costCol: findCol("annual plan cost", "plan cost", "cost (birr)"),
    mdUnitCol: findCol("md/unit", "f/md", "md / unit"),
    wageCol: findCol("wage"),
    normsMdCol: findCol("norms/md", "wa./md", "wa/md"),
    netAreaCol: findCol("net area"),
    freqCol: findCol("frequency", "freq"),
  };
}

const CHETU_MONTH_HEADERS = [
  { month: 10, aliases: ["octob", "oct"] },
  { month: 11, aliases: ["novm", "nov"] },
  { month: 12, aliases: ["decem", "dec"] },
  { month: 1, aliases: ["janw", "jan"] },
  { month: 2, aliases: ["febur", "feb"] },
  { month: 3, aliases: ["marc", "mar"] },
  { month: 4, aliases: ["apri", "apr"] },
  { month: 5, aliases: ["may"] },
  { month: 6, aliases: ["jun"] },
  { month: 7, aliases: ["jula", "jul"] },
  { month: 8, aliases: ["augo", "aug"] },
  { month: 9, aliases: ["sept", "sep"] },
];

function isActivitySerial(sn) {
  const n = num(sn);
  return n != null && Number.isInteger(n) && n >= 1 && n <= 99;
}

function isQtyHeader(t) {
  const s = t.toLowerCase();
  return (s.includes("quantity") || s === "qty" || s.includes("plan qty")) && !s.includes("month");
}

function isMdHeader(t) {
  const s = t.toLowerCase();
  return s === "md" || s.includes("manday") || s.includes("plan md") || s.includes("ጉልበት");
}

function isAnnualCostHeader(t) {
  const s = t.toLowerCase();
  if (!s || s.includes("unit") || s.includes("total cost") || s.includes("sub total")) return false;
  return (
    s === "cost" ||
    s.includes("cost (birr)") ||
    s.includes("plan cost") ||
    s.includes("ከፍያ")
  );
}

/** Find adjacent Quantity | Md | Cost headers (Chetu Annual Plan block). */
function findAnnualPlanTriplet(grid, startRow, endRow) {
  for (let hi = startRow; hi < endRow; hi++) {
    const hrow = grid[hi] || [];
    for (let c = 0; c < hrow.length - 2; c++) {
      const t0 = cellText(hrow[c]).toLowerCase();
      const t1 = cellText(hrow[c + 1]).toLowerCase();
      const t2 = cellText(hrow[c + 2]).toLowerCase();
      if (isQtyHeader(t0) && isMdHeader(t1) && isAnnualCostHeader(t2)) {
        return { annualQtyCol: c, annualMdCol: c + 1, annualCostCol: c + 2, headerRow: hi };
      }
    }
  }
  return null;
}

function finalizeActivity(act) {
  if ((!act.annualMandays || act.annualMandays <= 0) && act.annualQuantity > 0) {
    if (act.normMdPerUnit > 0) act.annualMandays = round2(act.annualQuantity * act.normMdPerUnit);
    else if (act.normsPerMd > 0) act.annualMandays = round2(act.annualQuantity / act.normsPerMd);
  }
  if ((!act.annualCostEtb || act.annualCostEtb <= 0) && act.annualMandays > 0 && act.normWageEtb > 0) {
    act.annualCostEtb = round2(act.annualMandays * act.normWageEtb);
  }
  if ((!act.annualCostEtb || act.annualCostEtb <= 0) && act.annualQuantity > 0 && act.costPerUnit > 0) {
    act.annualCostEtb = round2(act.annualQuantity * act.costPerUnit);
  }
  if (act.costPerUnit == null && act.annualQuantity > 0 && act.annualCostEtb > 0) {
    act.costPerUnit = round2(act.annualCostEtb / act.annualQuantity);
  }
  return act;
}

/** Detect Chetu Farm matrix: norms cols → Annual Plan (qty, md, cost) → monthly cols. */
function detectChetuLayout(grid) {
  let headerStart = -1;
  let dataStartRow = -1;
  let activityCol = 1;
  let unitCol = 2;
  let mdUnitCol = 3;
  let costUnitCol = 4;
  let wageCol = 5;
  let normsMdCol = 6;
  let annualQtyCol = null;
  let annualMdCol = null;
  let annualCostCol = null;
  const monthCols = {};

  for (let i = 0; i < Math.min(grid.length, 35); i++) {
    const joined = (grid[i] || []).map(cellText).join(" ").toLowerCase();
    if (!joined.includes("activit") && !joined.includes("የሥራ") && !joined.includes("md/unit")) continue;
    headerStart = i;
    break;
  }

  if (headerStart >= 0) {
    const triplet = findAnnualPlanTriplet(
      grid,
      Math.max(0, headerStart - 2),
      Math.min(grid.length, headerStart + 6),
    );
    if (triplet) {
      annualQtyCol = triplet.annualQtyCol;
      annualMdCol = triplet.annualMdCol;
      annualCostCol = triplet.annualCostCol;
      dataStartRow = triplet.headerRow + 1;
    }

    for (let hi = headerStart; hi < Math.min(headerStart + 6, grid.length); hi++) {
      const hrow = grid[hi] || [];
      for (let c = 0; c < hrow.length; c++) {
        const t = cellText(hrow[c]).toLowerCase();
        if (t.includes("f/md") || t.includes("md/unit")) mdUnitCol = c;
        if (t.includes("cost/unit") || t.includes("cost / unit")) costUnitCol = c;
        if (t.includes("wage")) wageCol = c;
        if (t.includes("norms/md") || t.includes("wa./md") || t.includes("wa/md")) normsMdCol = c;
        if (t.includes("activit") || t.includes("የሥራ")) activityCol = c;
        if ((t === "unit" || t.includes("መለኪያ")) && !t.includes("/")) unitCol = c;

        for (const { month, aliases } of CHETU_MONTH_HEADERS) {
          if (aliases.some((a) => t.startsWith(a) || t.includes(a))) {
            monthCols[month] = c;
          }
        }
      }
    }
  }

  if (annualQtyCol == null && headerStart >= 0) {
    const legacy = detectMatrixColumns(grid.slice(Math.max(0, headerStart - 1), headerStart + 4));
    annualQtyCol = legacy.qtyCol;
    annualMdCol = legacy.mdCol;
    annualCostCol = legacy.costCol;
    mdUnitCol = legacy.mdUnitCol ?? mdUnitCol;
    wageCol = legacy.wageCol ?? wageCol;
    normsMdCol = legacy.normsMdCol ?? normsMdCol;
  }

  if (annualQtyCol == null && headerStart >= 0) {
    annualQtyCol = 7;
    annualMdCol = 8;
    annualCostCol = 9;
  }

  if (dataStartRow < 0) dataStartRow = headerStart >= 0 ? headerStart + 1 : 0;

  const firstMonthCol =
    Object.keys(monthCols).length > 0 ? Math.min(...Object.values(monthCols)) : (annualCostCol ?? 9) + 1;

  return {
    headerStart,
    dataStartRow,
    activityCol,
    unitCol,
    mdUnitCol,
    costUnitCol,
    wageCol,
    normsMdCol,
    annualQtyCol,
    annualMdCol,
    annualCostCol,
    monthCols,
    firstMonthCol,
  };
}

function parseScopeFromHeader(grid, headerStart) {
  const scope = { blocks: [], grossAreaHa: null, trees: null, productiveTrees: null };
  if (headerStart <= 0) return scope;

  for (let i = 0; i < headerStart; i++) {
    const row = grid[i] || [];
    const label = row.map(cellText).join(" ").toLowerCase();
    if (label.includes("block")) {
      for (const cell of row) {
        const t = cellText(cell).toUpperCase();
        if (/^[A-G]$/.test(t)) scope.blocks.push(t);
        if (/^[A-G](,\s*[A-G])+/.test(t.replace(/\s/g, ""))) {
          scope.blocks = t.split(/[,\s]+/).filter((b) => /^[A-G]$/i.test(b)).map((b) => b.toUpperCase());
        }
      }
    }
    if (label.includes("gross area") || label.includes("total area")) {
      for (let c = 1; c < row.length; c++) {
        const n = num(row[c]);
        if (n != null && n > 0 && n < 10000) {
          scope.grossAreaHa = n;
          break;
        }
      }
    }
    if (label.includes("total tree") || label.includes("tree no")) {
      for (let c = 1; c < row.length; c++) {
        const n = num(row[c]);
        if (n != null && n > 100) {
          scope.trees = n;
          break;
        }
      }
    }
    if (label.includes("productive tree") || label.includes("average/ha")) {
      for (let c = 1; c < row.length; c++) {
        const n = num(row[c]);
        if (n != null && n > 0) {
          scope.productiveTrees = n;
          break;
        }
      }
    }
  }

  scope.blocks = [...new Set(scope.blocks)];
  return scope;
}

function parseMonthlyScheduleFromRow(row, layout) {
  const schedule = [];
  for (const month of BUDGET_MONTHS) {
    const col = layout.monthCols[month];
    if (col == null) continue;
    const costEtb = num(row[col]);
    const qty = num(row[col - 1]);
    const md = num(row[col - 2]);
    if (costEtb != null && costEtb > 0) {
      schedule.push({ month, quantity: qty ?? 0, mandays: md ?? 0, costEtb });
    } else if (qty != null && qty > 0) {
      schedule.push({ month, quantity: qty, mandays: md ?? 0, costEtb: 0 });
    }
  }
  return schedule;
}

function parseActivitySheet(rows, sectionMeta) {
  const activities = [];
  for (const row of rows) {
    const id = String(row.id || row.Code || row.code || "").trim();
    if (!id || id.toLowerCase() === "code") continue;
    const nameEn = String(row.nameEn || row.Activity || row.activity || row[1] || id).trim();
    if (!nameEn) continue;
    activities.push({
      id,
      nameEn,
      nameAm: row.nameAm || null,
      unit: String(row.unit || row.Unit || "unit").trim(),
      normMdPerUnit: num(row.normMdPerUnit ?? row["MD/unit"] ?? row["md/unit"] ?? row.mdPerUnit),
      normWageEtb: num(row.normWageEtb ?? row["Wage ETB"] ?? row["Wage rate"] ?? row.wageEtb),
      normsPerMd: num(row.normsPerMd ?? row["Units/MD"] ?? row["wa./MD"] ?? row["Norms/md"]),
      netArea: num(row.netArea ?? row["Net Area"] ?? row["Net area"]),
      frequency: num(row.frequency ?? row.Frequency ?? row.Freq),
      costPerUnit: num(row.costPerUnit ?? row["Cost/Unit"] ?? row["Cost/unit"]),
      annualQuantity: num(row.annualQuantity ?? row.Quantity ?? row.qty ?? row["Annual Plan Quantity"]),
      annualMandays: num(row.annualMandays ?? row.Mandays ?? row.md ?? row["Annual Plan Md"]),
      annualCostEtb: num(row.annualCostEtb ?? row["Cost ETB"] ?? row.costEtb ?? row["Annual Plan Cost"]),
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

/**
 * Parse Chetu-style matrix sheets (S/N | Activity | Unit | … | Annual qty/md/cost).
 */
function parseActivityMatrix(sheet, sectionMeta) {
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  if (!grid.length) return null;

  const objects = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (objects.length) {
    const sample = objects[0] || {};
    const keys = Object.keys(sample).map((k) => k.toLowerCase());
    if (keys.some((k) => k === "id" || k === "code" || k.includes("code"))) {
      const parsed = parseActivitySheet(objects, sectionMeta);
      if (parsed.activities.length) return parsed;
    }
  }

  const layout = detectChetuLayout(grid);
  if (layout.headerStart < 0) return null;

  const scope = parseScopeFromHeader(grid, layout.headerStart);
  const prefix =
    sectionMeta.sectionCode === "nursery"
      ? "NUR"
      : sectionMeta.sectionCode === "young_coffee"
        ? "YNG"
        : sectionMeta.sectionCode === "matured_coffee"
          ? "MAT"
          : sectionMeta.sectionCode === "infilling"
            ? "INF"
            : sectionMeta.sectionCode === "harvest"
              ? "HAR"
              : "ACT";

  const activities = [];
  let seq = 0;
  for (let r = layout.dataStartRow; r < grid.length; r++) {
    const row = grid[r] || [];
    const sn = cellText(row[0]);
    const nameCandidate = cellText(row[layout.activityCol]) || cellText(row[1]);
    if (!looksLikeActivityName(nameCandidate)) continue;
    if (/sub\s*total|total labor|አጠቃላይ|total cost/i.test(nameCandidate)) break;
    if (/^(ጉልበት|ከፍያ|mandays?|cost)$/i.test(nameCandidate)) continue;
    if (!isActivitySerial(sn)) continue;

    seq += 1;
    const unit = cellText(row[layout.unitCol]) || "unit";
    let annualQuantity = layout.annualQtyCol != null ? num(row[layout.annualQtyCol]) : null;
    let annualMandays = layout.annualMdCol != null ? num(row[layout.annualMdCol]) : null;
    let annualCostEtb = layout.annualCostCol != null ? num(row[layout.annualCostCol]) : null;

    if (annualQuantity == null && annualMandays == null && annualCostEtb == null) continue;

    const normMdPerUnit = layout.mdUnitCol != null ? num(row[layout.mdUnitCol]) : null;
    const normWageEtb = layout.wageCol != null ? num(row[layout.wageCol]) : null;
    const normsPerMd = layout.normsMdCol != null ? num(row[layout.normsMdCol]) : null;
    const costPerUnit = layout.costUnitCol != null ? num(row[layout.costUnitCol]) : null;
    const schedule = parseMonthlyScheduleFromRow(row, layout);

    const id = `${prefix}-${String(seq).padStart(2, "0")}`;

    activities.push(
      finalizeActivity({
        id,
        nameEn: nameCandidate,
        nameAm: null,
        unit,
        normMdPerUnit,
        normWageEtb,
        normsPerMd,
        netArea: null,
        frequency: null,
        costPerUnit,
        annualQuantity: annualQuantity ?? 0,
        annualMandays: annualMandays ?? 0,
        annualCostEtb: annualCostEtb ?? 0,
        schedule,
      }),
    );
  }

  if (!activities.length) return null;
  return {
    sectionCode: sectionMeta.sectionCode,
    sectionLabel: sectionMeta.sectionLabel,
    afpLineId: sectionMeta.afpLineId,
    scope: scope.blocks.length || scope.grossAreaHa || scope.trees ? scope : sectionMeta.scope || null,
    activities,
  };
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
      netArea: a.netArea ?? null,
      frequency: a.frequency ?? null,
      costPerUnit: a.costPerUnit ?? null,
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
      schedule:
        l.schedule ||
        (l.normWageEtb ? BUDGET_MONTHS.map((month) => ({ month, costEtb: l.normWageEtb })) : l.schedule),
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
    const def =
      CATEGORY_DEFS.find((d) => d.afpLineId === afpLineId) ||
      CATEGORY_DEFS.find((d) =>
        label.toLowerCase().includes(d.activity.split("—")[0].trim().toLowerCase().slice(0, 12)),
      );
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
      oct: 10, nov: 11, dec: 12, jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9,
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

const SECTION_SHEETS = [
  {
    sheet: "Nursery",
    aliases: ["nursery", "nursery operations", "ችግኝ", "i. nursery"],
    sectionCode: "nursery",
    sectionLabel: "I. Nursery Operations",
    afpLineId: "AFP-2026-001",
  },
  {
    sheet: "Young Coffee",
    aliases: ["young coffee", "young coffee care", "ii. young", "ወጣት"],
    sectionCode: "young_coffee",
    sectionLabel: "II. Young Coffee Care",
    afpLineId: "AFP-2026-002",
  },
  {
    sheet: "Mature Coffee",
    aliases: ["mature coffee", "matured coffee", "mature coffee care", "iii. mature", "የበሰለ"],
    sectionCode: "matured_coffee",
    sectionLabel: "III. Mature Coffee Main Care",
    afpLineId: "AFP-2026-003",
  },
  {
    sheet: "Infilling",
    aliases: ["infilling", "infilling operations", "iv. infill", "ክፍተት"],
    sectionCode: "infilling",
    sectionLabel: "IV. Infilling Operations",
    afpLineId: "AFP-2026-004",
  },
  {
    sheet: "Harvest",
    aliases: ["harvest", "harvest & processing", "picking", "መከር"],
    sectionCode: "harvest",
    sectionLabel: "V & VI. Harvest & Processing",
    afpLineId: "AFP-2026-005",
  },
  {
    sheet: "Materials",
    aliases: ["materials", "material cost", "material"],
    sectionCode: "materials",
    sectionLabel: "Materials",
    afpLineId: "AFP-2026-006",
  },
  {
    sheet: "Salary",
    aliases: ["salary", "payroll", "salary & admin"],
    sectionCode: "salary",
    sectionLabel: "Salary & Admin",
    afpLineId: "AFP-2026-010",
  },
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
              plannedCostEtb:
                code === "PAY-09" && month === 9
                  ? annualEtb
                  : code === "PAY-10" && month === 3
                    ? annualEtb
                    : monthlyEtb,
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

exports.parseExcelBuffer = (buffer, fx = DEFAULT_FX, options = {}) => {
  const selectedSectionCode = options.sectionCode ? String(options.sectionCode).trim() : null;
  if (selectedSectionCode && !sectionMetaByCode(selectedSectionCode)) {
    throw new AppError(
      400,
      "INVALID_SECTION",
      `Unknown operation "${selectedSectionCode}". Choose nursery, young_coffee, matured_coffee, infilling, harvest, materials, or salary.`,
    );
  }

  const wb = XLSX.read(buffer, { type: "buffer" });
  const foundSheets = sheetNames(wb);
  let categories = [];
  let sections = [];
  let salaryLines = [];
  const matchedSheetNames = [];

  const sheetsToParse = selectedSectionCode
    ? SECTION_SHEETS.filter((s) => s.sectionCode === selectedSectionCode)
    : SECTION_SHEETS;

  // Summary/monthly only when importing the full workbook (no single-operation filter)
  if (!selectedSectionCode) {
    const summaryHit = findSheet(wb, ["summary", "cost summary", "overview"]);
    if (summaryHit) {
      const rows = XLSX.utils.sheet_to_json(summaryHit.sheet, { header: 1, defval: "" });
      categories = parseSummarySheet(rows, fx);
      matchedSheetNames.push(summaryHit.name);
    }

    const monthlyHit = findSheet(wb, ["monthly", "month schedule"]);
    if (monthlyHit && categories.length) {
      const rows = XLSX.utils.sheet_to_json(monthlyHit.sheet, { header: 1, defval: "" });
      categories = parseMonthlySheet(rows, categories, fx);
      matchedSheetNames.push(monthlyHit.name);
    }
  }

  for (const meta of sheetsToParse) {
    const hit = findSheet(wb, [meta.sheet, ...(meta.aliases || [])]);
    if (!hit) continue;
    matchedSheetNames.push(hit.name);

    if (meta.sectionCode === "salary") {
      const rows = XLSX.utils.sheet_to_json(hit.sheet, { defval: "" });
      salaryLines = parseSalarySheet(rows);
      if (salaryLines.length) {
        sections.push({
          sectionCode: meta.sectionCode,
          sectionLabel: meta.sectionLabel,
          afpLineId: meta.afpLineId,
          activities: salaryLines.map((l) => ({
            ...l,
            nameAm: null,
            normMdPerUnit: null,
            normsPerMd: null,
            annualQuantity: l.schedule?.length || 12,
            annualMandays: 0,
          })),
        });
      }
      continue;
    }

    const parsedSection = parseActivityMatrix(hit.sheet, meta);
    if (parsedSection?.activities?.length) sections.push(parsedSection);
  }

  // Unnamed / single-sheet workbooks: use selected operation, or infer from sheet title — never force Nursery
  if (!sections.length && foundSheets.length) {
    for (const name of foundSheets) {
      const lower = name.toLowerCase();
      if (lower.includes("summary") || lower.includes("monthly")) continue;
      if (!selectedSectionCode && lower.includes("salary")) continue;

      const meta =
        (selectedSectionCode && sectionMetaByCode(selectedSectionCode)) ||
        inferSectionFromSheetName(name);
      if (!meta) continue;
      if (selectedSectionCode && meta.sectionCode !== selectedSectionCode) continue;

      if (meta.sectionCode === "salary") {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
        salaryLines = parseSalarySheet(rows);
        if (salaryLines.length) {
          sections.push({
            sectionCode: meta.sectionCode,
            sectionLabel: meta.sectionLabel,
            afpLineId: meta.afpLineId,
            activities: salaryLines.map((l) => ({
              ...l,
              nameAm: null,
              normMdPerUnit: null,
              normsPerMd: null,
              annualQuantity: l.schedule?.length || 12,
              annualMandays: 0,
            })),
          });
          matchedSheetNames.push(name);
          break;
        }
        continue;
      }

      const parsedSection = parseActivityMatrix(wb.Sheets[name], meta);
      if (parsedSection?.activities?.length) {
        sections.push(parsedSection);
        matchedSheetNames.push(name);
        break;
      }
    }
  }

  // Last resort when user explicitly selected an operation: parse first data sheet as that operation
  if (!sections.length && selectedSectionCode && foundSheets.length) {
    const meta = sectionMetaByCode(selectedSectionCode);
    for (const name of foundSheets) {
      const lower = name.toLowerCase();
      if (lower.includes("summary") || lower.includes("monthly")) continue;
      if (meta.sectionCode === "salary") {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
        salaryLines = parseSalarySheet(rows);
        if (salaryLines.length) {
          sections.push({
            sectionCode: meta.sectionCode,
            sectionLabel: meta.sectionLabel,
            afpLineId: meta.afpLineId,
            activities: salaryLines.map((l) => ({
              ...l,
              nameAm: null,
              normMdPerUnit: null,
              normsPerMd: null,
              annualQuantity: l.schedule?.length || 12,
              annualMandays: 0,
            })),
          });
          matchedSheetNames.push(name);
          break;
        }
        continue;
      }
      const parsedSection = parseActivityMatrix(wb.Sheets[name], meta);
      if (parsedSection?.activities?.length) {
        sections.push(parsedSection);
        matchedSheetNames.push(name);
        break;
      }
    }
  }

  sections = sections.filter((s) => (s.activities || []).length > 0);

  // CRITICAL: never fall back to seed/reference data on upload
  if (!sections.length && !categories.length) {
    const opHint = selectedSectionCode
      ? ` for operation "${selectedSectionCode}"`
      : "";
    throw new AppError(
      400,
      "EXCEL_PARSE_EMPTY",
      `Could not read activities${opHint} from this Excel file. Found sheets: ${foundSheets.join(", ") || "(none)"}. ` +
        "Select the correct operation before upload, or name sheets Nursery, Young Coffee, Mature Coffee, Infilling, Harvest, Materials, and/or Salary.",
    );
  }

  if (!categories.length && sections.length) {
    categories = categoriesFromSections(sections, fx);
  }

  return reconcileTotals({
    source: "Excel upload",
    inputMethod: "excel",
    matchedSheets: [...new Set(matchedSheetNames)],
    workbookSheets: foundSheets,
    selectedSectionCode: selectedSectionCode || null,
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
