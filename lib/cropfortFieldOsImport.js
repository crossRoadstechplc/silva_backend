/**
 * Parse and import Cropfort Field OS workbooks (Template + Chaka Buna Simulator).
 */
const path = require("path");
const XLSX = require("xlsx");

const DOCS_DIR = path.resolve(__dirname, "../../../Docs/new data");
const TEMPLATE_PATH = path.join(DOCS_DIR, "Cropfort Coffee Field OS Template.xlsx");
const CHAKA_PATH = path.join(DOCS_DIR, "Cropfort Chaka Buna Populated Simulator.xlsx");

const BAGRO_FARMS = [
  { id: "fest_telli", name: "Telli", location: "Kaffa", region: "Kaffa" },
  { id: "fest_efrata", name: "Efrata", location: "Bench Maji", region: "Bench Maji" },
  { id: "fest_kamisse", name: "Kamisse", location: "Jimma", region: "Jimma" },
  { id: "fest_cheta", name: "Cheta", location: "Kaffa", region: "Kaffa" },
  { id: "fest_shakiso", name: "Shakiso", location: "Guji", region: "Guji" },
  { id: "fest_gawi", name: "Gawi", location: "Kaffa", region: "Kaffa" },
];

const CHAKA_ESTATE = {
  id: "fest_chaka_buna",
  name: "Chaka Buna",
  location: "Kaffa",
  totalAreaHa: 230,
};

function readSheet(filePath, sheetName) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

/**
 * Excel arithmetic leaks binary-float noise (39.885 arrives as 39.885000000000005),
 * so trim to 6 decimals — the deepest precision any sheet column actually carries.
 */
function num(val) {
  if (val === "" || val == null) return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1e6) / 1e6;
}

function str(val) {
  if (val == null) return "";
  return String(val).trim();
}

/**
 * Excel serial dates land a few seconds short of midnight (…T20:59:44Z), so snap
 * to the nearest whole UTC day to recover the date the workbook actually shows.
 */
function date(val) {
  if (val === "" || val == null) return null;
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  const DAY = 24 * 60 * 60 * 1000;
  return new Date(Math.round(d.getTime() / DAY) * DAY);
}

function tierFromPrefix(code) {
  if (code.startsWith("T1-")) return "tier1";
  if (code.startsWith("T2-")) return "tier2";
  if (code.startsWith("T3-")) return "tier3";
  return "standard";
}

function slugCode(code) {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function parseActivityList(templatePath = TEMPLATE_PATH) {
  const rows = readSheet(templatePath, "Activity List");
  const activities = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const code = str(r[0]);
    if (!code || !code.includes("-")) continue;
    activities.push({
      code,
      tierLabel: str(r[1]),
      category: str(r[2]),
      name: str(r[3]),
      unitOfMeasure: str(r[4]) || "ha",
      tier: tierFromPrefix(code),
      defaultTick: str(r[6]).toUpperCase() === "Y",
    });
  }
  return activities;
}

function parseMaterialRateCard(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Material Rate Card");
  const lines = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const code = str(r[0]);
    if (!code || code === "Material ID") continue;
    const rate = num(r[3]);
    if (rate == null) continue;
    lines.push({
      resourceCode: code,
      resourceName: str(r[1]),
      unitOfMeasure: str(r[2]) || "ETB",
      rateEtb: rate,
      resourceType: "material",
      spxJustificationNote: str(r[4]) || null,
    });
  }
  return lines;
}

function parseServiceRateCard(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Outsourced Services Rate Card");
  const lines = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const code = str(r[0]);
    if (!code || code === "Service ID") continue;
    const rate = num(r[3]);
    if (rate == null) continue;
    lines.push({
      resourceCode: code,
      resourceName: str(r[1]),
      unitOfMeasure: str(r[2]) || "ETB",
      rateEtb: rate,
      resourceType: "service",
      spxJustificationNote: str(r[4]) || null,
    });
  }
  return lines;
}

function parseLaborRateCard(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Labor Rate Card");
  const byCode = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const code = str(r[0]);
    if (!code || code === "Activity ID") continue;
    const laborNorm = num(r[3]);
    const laborWageEtb = num(r[4]);
    const laborCostPerUnit = num(r[6]);
    if (laborNorm == null && laborWageEtb == null && laborCostPerUnit == null) continue;
    byCode.set(code, {
      laborNorm,
      laborWageEtb,
      laborCostPerUnit: laborCostPerUnit != null && laborCostPerUnit > 0 ? laborCostPerUnit : null,
    });
  }
  return byCode;
}

function parseBenchmarkSurvey(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Benchmark Rate Survey");
  const byCode = new Map();
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const code = str(r[0]);
    if (!code) continue;
    byCode.set(code, {
      benchmarkFarmARate: num(r[4]),
      benchmarkFarmBRate: num(r[6]),
      proposedRate: num(r[9]),
      status: str(r[10]),
    });
  }
  return byCode;
}

/** Full benchmark survey rows (neighbor names, lock flag, approval dates) per activity code. */
function parseBenchmarkSurveyDetail(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Benchmark Rate Survey");
  const byCode = new Map();
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    const code = str(r[0]);
    if (!code || code === "Activity ID") continue;
    byCode.set(code, {
      activityCode: code,
      activityName: str(r[1]),
      unit: str(r[2]),
      neighbor1Name: str(r[3]) || null,
      neighbor1Rate: num(r[4]),
      neighbor2Name: str(r[5]) || null,
      neighbor2Rate: num(r[6]),
      locked: str(r[7]).toUpperCase() === "Y",
      recommendedRate: num(r[8]),
      proposedRate: num(r[9]),
      status: str(r[10]).toLowerCase() || "draft",
      approverName: str(r[11]) || null,
      approvalDate: date(r[12]),
      validUntil: date(r[13]),
    });
  }
  return byCode;
}

function parseMaterialBudgetLinks(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Material Budget");
  const byActivity = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const activityCode = str(r[1]);
    const materialCode = str(r[3]);
    const materialNorm = num(r[4]);
    if (!activityCode || !materialCode || materialNorm == null) continue;
    if (!byActivity.has(activityCode)) {
      byActivity.set(activityCode, { materialRateCode: materialCode, materialNorm });
    }
  }
  return byActivity;
}

function parseChakaMasterBlocks(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Master");
  const blocks = [];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (str(rows[i][0]) === "Block ID") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return blocks;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const code = str(r[0]);
    if (!code || !code.startsWith("BLK-")) continue;
    const areaHa = num(r[2]);
    const treeCount = num(r[5]);
    blocks.push({
      code,
      label: str(r[1]) || code,
      areaHa,
      treeCount: treeCount != null ? Math.round(treeCount) : null,
      notes: str(r[7]) || null,
    });
  }
  return blocks;
}

/** Master sheet: farm header + the 20 block registry rows. */
function parseChakaMaster(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Master");
  let farmName = null;
  let termStartDate = null;
  let headerIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const label = str(rows[i][0]);
    if (label.startsWith("Farm Name")) farmName = str(rows[i][1]) || null;
    if (label.startsWith("Term Start Date")) termStartDate = date(rows[i][1]);
    if (label === "Block ID") {
      headerIdx = i;
      break;
    }
  }

  const blocks = [];
  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const code = str(r[0]);
      if (!code || !code.startsWith("BLK-")) continue;
      const treeCount = num(r[5]);
      const rawStatus = str(r[6]).toLowerCase();
      blocks.push({
        code,
        label: str(r[1]) || code,
        areaHa: num(r[2]),
        varietyPlanted: str(r[3]) || null,
        plantingDate: date(r[4]),
        treeCount: treeCount != null ? Math.round(treeCount) : null,
        status: rawStatus.startsWith("active") ? "active" : "inactive",
        notes: str(r[7]) || null,
      });
    }
  }

  return { farmName, termStartDate, blocks };
}

/** Fee Schedule sheet: confirmed core fee + elective lines. */
function parseFeeSchedule(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Fee Schedule");
  let coreAnnualFee = null;
  const lines = [];
  let inElective = false;

  for (const r of rows) {
    const label = str(r[0]);
    if (!label) continue;
    if (label.startsWith("Core Services")) {
      coreAnnualFee = num(r[1]);
      continue;
    }
    if (label.startsWith("ELECTIVE FEE LINES")) {
      inElective = true;
      continue;
    }
    if (label.startsWith("MONTHLY SCHEDULE")) break;
    if (!inElective) continue;
    if (label === "Elective Line") continue;
    if (!label.startsWith("Tier")) continue;

    const annualFee = num(r[1]);
    const activationMonth = num(r[2]);
    lines.push({
      label,
      annualFee,
      activationMonth: activationMonth != null ? Math.round(activationMonth) : null,
      deferred: annualFee == null,
      note: str(r[3]) || null,
    });
  }

  return { coreAnnualFee, lines };
}

/** Annual Election sheet: core bundle flag + per-block Tier 1 and farm-wide Tier 2/3 rows. */
function parseAnnualElection(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Annual Election");
  let coreBundleElected = null;
  let headerIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const label = str(rows[i][0]);
    if (label.startsWith("Core Bundle Tick")) {
      const tick = rows[i].slice(1).map(str).find((v) => v);
      coreBundleElected = tick ? tick.toUpperCase() === "Y" : null;
    }
    if (label === "Block ID") {
      headerIdx = i;
      break;
    }
  }

  const elections = [];
  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const scope = str(r[0]);
      const activityCode = str(r[1]);
      if (!scope || !activityCode) continue;
      const duration = num(r[6]);
      elections.push({
        blockCode: scope === "FARM-WIDE" ? null : scope,
        activityCode,
        category: str(r[2]) || null,
        activityName: str(r[3]) || null,
        defaultWindowStart: date(r[4]),
        defaultWindowEnd: date(r[5]),
        plannedDurationDays: duration != null ? Math.round(duration) : null,
        effectiveEndDate: date(r[7]),
        elected: str(r[8]).toUpperCase() === "Y",
      });
    }
  }

  return { coreBundleElected, elections };
}

/** Activity Plan sheet: planned quantity and labor cost per block/activity. */
function parseActivityPlan(chakaPath = CHAKA_PATH) {
  const rows = readSheet(chakaPath, "Activity Plan");
  const plans = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const scope = str(r[0]);
    const activityCode = str(r[2]);
    if (!scope || !activityCode || scope === "Block ID") continue;
    plans.push({
      blockCode: scope === "FARM-WIDE" ? null : scope,
      activityCode,
      activityName: str(r[3]) || null,
      unit: str(r[5]) || null,
      elected: str(r[6]).toUpperCase() === "Y",
      plannedQty: num(r[7]),
      laborRatePerUnit: num(r[8]),
      plannedLaborCost: num(r[9]),
    });
  }
  return plans;
}

function buildActivityRecords(activities, laborMap, benchmarkMap, materialLinkMap) {
  return activities.map((a) => {
    const labor = laborMap.get(a.code) || {};
    const bench = benchmarkMap.get(a.code) || {};
    const mat = materialLinkMap.get(a.code) || {};
    let laborCostPerUnit = labor.laborCostPerUnit;
    if (bench.status?.toLowerCase() === "approved" && bench.proposedRate != null && bench.proposedRate > 0) {
      laborCostPerUnit = bench.proposedRate;
    } else if (
      laborCostPerUnit == null &&
      labor.laborNorm != null &&
      labor.laborWageEtb != null &&
      labor.laborNorm > 0 &&
      labor.laborWageEtb > 0
    ) {
      laborCostPerUnit = null;
    }
    return {
      ...a,
      laborNorm: labor.laborNorm ?? null,
      laborWageEtb: labor.laborWageEtb ?? null,
      laborCostPerUnit,
      materialNorm: mat.materialNorm ?? null,
      materialRateCode: mat.materialRateCode ?? null,
      serviceNorm: null,
      serviceRateCode: null,
      benchmarkFarmARate: bench.benchmarkFarmARate ?? null,
      benchmarkFarmBRate: bench.benchmarkFarmBRate ?? null,
    };
  });
}

function loadCatalog() {
  const activities = parseActivityList();
  const laborMap = parseLaborRateCard();
  const benchmarkMap = parseBenchmarkSurvey();
  const materialLinkMap = parseMaterialBudgetLinks();
  const materialRates = parseMaterialRateCard();
  const serviceRates = parseServiceRateCard();
  const chakaBlocks = parseChakaMasterBlocks();
  const activityRecords = buildActivityRecords(activities, laborMap, benchmarkMap, materialLinkMap);
  return {
    activities: activityRecords,
    materialRates,
    serviceRates,
    chakaBlocks,
    bagroFarms: BAGRO_FARMS,
    chakaEstate: CHAKA_ESTATE,
  };
}

module.exports = {
  DOCS_DIR,
  TEMPLATE_PATH,
  CHAKA_PATH,
  BAGRO_FARMS,
  CHAKA_ESTATE,
  loadCatalog,
  parseActivityList,
  parseMaterialRateCard,
  parseServiceRateCard,
  parseLaborRateCard,
  parseBenchmarkSurvey,
  parseBenchmarkSurveyDetail,
  parseChakaMasterBlocks,
  parseChakaMaster,
  parseFeeSchedule,
  parseAnnualElection,
  parseActivityPlan,
};
