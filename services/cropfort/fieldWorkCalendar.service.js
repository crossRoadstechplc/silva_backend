const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { requireProgramId } = require("../utils/programScope");
const {
  CATEGORY_WINDOWS,
  activityTierFromCode,
  ONE_TIME_BUILD_OUT_CODES,
} = require("../../lib/cropfortCategoryWindows");

const PEAK_CATEGORIES = new Set([
  "Picking & Related",
  "Harvest Mgmt",
  "Coffee Ops",
  "Coffee Operations",
  "Export & Commercial",
]);

const REFERENCE_ONLY_CATEGORIES = new Set([
  "Institutional/Strategic",
  "Institutional & Strategic",
]);

function resolveCategoryWindow(category, activityCode) {
  let window = CATEGORY_WINDOWS[category];
  if (!window && category) {
    const match = Object.keys(CATEGORY_WINDOWS).find((k) =>
      category.toLowerCase().includes(k.toLowerCase().split(" ")[0]),
    );
    window = match ? CATEGORY_WINDOWS[match] : null;
  }
  if (activityCode && ONE_TIME_BUILD_OUT_CODES.has(activityCode)) {
    return { start: 0, end: 2 };
  }
  return window || null;
}

function isReferenceOnlyCategory(category) {
  if (!category) return false;
  if (REFERENCE_ONLY_CATEGORIES.has(category)) return true;
  return /institutional/i.test(category);
}

function isAssetDevelopment(category) {
  return Boolean(category && /asset\s*development/i.test(category));
}

function commercialStatusFor(tier, category) {
  if (isAssetDevelopment(category) || isReferenceOnlyCategory(category)) return "quoted";
  if (tier === "tier1") return "confirmed";
  if (/coffee\s*ops|export/i.test(category || "")) return "elective";
  if (tier === "tier2" || tier === "tier3") return "elective";
  return "confirmed";
}

function normalizeTier(tier, code) {
  const fromCode = activityTierFromCode(code);
  if (fromCode) return fromCode;
  const t = String(tier || "").toLowerCase().replace(/\s+/g, "");
  if (t === "tier1" || t === "1" || t === "core") return "tier1";
  if (t === "tier2" || t === "2") return "tier2";
  if (t === "tier3" || t === "3") return "tier3";
  return "tier1";
}

/** Build month indices 1–36 and intensities for a category window (repeats Y1–Y3). */
function buildIntensityCells(category, activityCode) {
  if (isReferenceOnlyCategory(category)) return [];
  const window = resolveCategoryWindow(category, activityCode);
  if (!window) {
    if (isAssetDevelopment(category)) {
      // Indicative Year-1 span when no explicit window
      return buildCellsForOffsets(0, 5, category, true);
    }
    return [];
  }
  return buildCellsForOffsets(window.start, window.end, category, false);
}

function buildCellsForOffsets(startOffset, endOffset, category, indicative) {
  const peak = PEAK_CATEGORIES.has(category) || /harvest|picking|export|coffee\s*ops/i.test(category || "");
  const cells = [];
  for (let year = 0; year < 3; year++) {
    const yearStart = year * 12;
    for (let m = startOffset; m <= endOffset; m++) {
      const monthIndex = yearStart + m + 1;
      if (monthIndex < 1 || monthIndex > 36) continue;
      let intensity = "active";
      if (peak && (m === startOffset || m === endOffset)) intensity = "peak";
      else if (indicative && m !== startOffset && m !== endOffset) intensity = "light";
      cells.push({ monthIndex, intensity });
    }
  }
  return cells;
}

function buildMonthLabels(termStart) {
  const base = termStart ? new Date(termStart) : new Date();
  const labels = [];
  for (let m = 0; m < 36; m++) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + m);
    labels.push({
      monthIndex: m + 1,
      monthLabel: d.toISOString().slice(0, 7),
      yearSlice: Math.floor(m / 12) + 1,
    });
  }
  return labels;
}

function serializeCalendar(row, termStart) {
  if (!row) return null;
  return {
    id: row.id,
    farmEstateId: row.farmEstateId,
    termStartDate: row.termStartDate,
    status: row.status,
    version: row.version,
    returnedComment: row.returnedComment,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    monthLabels: buildMonthLabels(termStart || row.termStartDate),
    rows: (row.rows || []).map((r) => ({
      id: r.id,
      activityId: r.activityId,
      activityCode: r.activityCode,
      activityName: r.activityName,
      tier: r.tier,
      category: r.category,
      commercialStatus: r.commercialStatus,
      annualFeeEtb: r.annualFeeEtb != null ? Number(r.annualFeeEtb) : null,
      sortOrder: r.sortOrder,
      notes: r.notes,
      cells: (r.cells || []).map((c) => ({
        id: c.id,
        monthIndex: c.monthIndex,
        intensity: c.intensity,
      })),
    })),
  };
}

async function loadLatest(programId, farmEstateId) {
  return prisma.field_work_calendars.findFirst({
    where: { farmEstateId, programId },
    orderBy: { version: "desc" },
    include: {
      rows: {
        orderBy: [{ sortOrder: "asc" }, { activityCode: "asc" }],
        include: { cells: { orderBy: { monthIndex: "asc" } } },
      },
    },
  });
}

exports.buildMonthLabels = buildMonthLabels;
exports.buildIntensityCells = buildIntensityCells;
exports.commercialStatusFor = commercialStatusFor;

exports.get = async (user, farmEstateId) => {
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findFirst({
    where: { id: farmEstateId, programId },
  });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm estate not found.");
  const row = await loadLatest(programId, farmEstateId);
  return serializeCalendar(row, farm.termStartDate);
};

const TX_OPTIONS = { maxWait: 15000, timeout: 120000 };

async function replaceRows(tx, calendarId, rows) {
  await tx.field_work_calendar_rows.deleteMany({ where: { calendarId } });

  const rowRecords = [];
  const cellRecords = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tier = normalizeTier(r.tier, r.activityCode);
    const category = r.category || "Uncategorized";
    const rowId = uuid("fwcr");
    rowRecords.push({
      id: rowId,
      calendarId,
      activityId: r.activityId || null,
      activityCode: r.activityCode,
      activityName: r.activityName,
      tier,
      category,
      commercialStatus: r.commercialStatus || commercialStatusFor(tier, category),
      annualFeeEtb: r.annualFeeEtb ?? null,
      sortOrder: r.sortOrder ?? i,
      notes: r.notes ?? null,
    });
    for (const c of r.cells || []) {
      if (c.monthIndex < 1 || c.monthIndex > 36) continue;
      cellRecords.push({
        id: uuid("fwcc"),
        rowId,
        monthIndex: c.monthIndex,
        intensity: c.intensity,
      });
    }
  }

  if (rowRecords.length) {
    await tx.field_work_calendar_rows.createMany({ data: rowRecords });
  }
  if (cellRecords.length) {
    // Chunk to avoid oversized payloads on pooler connections
    const CHUNK = 500;
    for (let i = 0; i < cellRecords.length; i += CHUNK) {
      await tx.field_work_calendar_cells.createMany({
        data: cellRecords.slice(i, i + CHUNK),
      });
    }
  }
}

exports.upsertDraft = async (user, farmEstateId, dto) => {
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findFirst({
    where: { id: farmEstateId, programId },
  });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm estate not found.");

  const existing = await prisma.field_work_calendars.findFirst({
    where: { farmEstateId, programId, status: "draft" },
    orderBy: { version: "desc" },
  });

  await prisma.$transaction(async (tx) => {
    let calendar;
    if (existing) {
      calendar = await tx.field_work_calendars.update({
        where: { id: existing.id },
        data: {
          termStartDate: farm.termStartDate,
        },
      });
    } else {
      const latest = await tx.field_work_calendars.findFirst({
        where: { farmEstateId, programId },
        orderBy: { version: "desc" },
      });
      calendar = await tx.field_work_calendars.create({
        data: {
          id: uuid("fwc"),
          programId,
          farmEstateId,
          termStartDate: farm.termStartDate,
          version: (latest?.version || 0) + 1,
          supersedesId: latest?.id || null,
          createdByUserId: user.id,
        },
      });
    }
    if (dto.rows) {
      await replaceRows(tx, calendar.id, dto.rows);
    }
  }, TX_OPTIONS);

  return exports.get(user, farmEstateId);
};

exports.seedFromTemplates = async (user, farmEstateId) => {
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findFirst({
    where: { id: farmEstateId, programId },
  });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm estate not found.");

  const templates = await prisma.activity_templates.findMany({
    orderBy: { code: "asc" },
  });
  const masters = await prisma.activity_master.findMany({
    where: { programId },
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
  const masterByCode = new Map();
  for (const m of masters) {
    if (!masterByCode.has(m.code)) masterByCode.set(m.code, m);
  }

  const rows = templates.map((t, i) => {
    const tier = normalizeTier(t.tier, t.code);
    const category = t.category || "Uncategorized";
    const master = masterByCode.get(t.code);
    const refOnly = isReferenceOnlyCategory(category);
    return {
      activityId: master?.id || null,
      activityCode: t.code,
      activityName: t.name,
      tier,
      category,
      commercialStatus: commercialStatusFor(tier, category),
      annualFeeEtb: null,
      sortOrder: i,
      notes: refOnly
        ? "On-demand / institutional — listed for reference only"
        : isAssetDevelopment(category)
          ? "Asset development — indicative window; fee deferred"
          : null,
      cells: buildIntensityCells(category, t.code),
    };
  });

  return exports.upsertDraft(user, farmEstateId, { rows });
};

exports.submit = async (user, farmEstateId) => {
  const programId = requireProgramId(user);
  const row = await prisma.field_work_calendars.findFirst({
    where: { farmEstateId, programId, status: "draft" },
    orderBy: { version: "desc" },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Draft field work calendar not found.");
  await prisma.field_work_calendars.update({
    where: { id: row.id },
    data: { status: "submitted", submittedAt: new Date() },
  });
  return exports.get(user, farmEstateId);
};

exports.approve = async (user, farmEstateId) => {
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findFirst({
    where: { id: farmEstateId, programId },
  });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm estate not found.");
  if (farm.approverUserId && farm.approverUserId !== user.id) {
    throw new AppError(403, "FORBIDDEN", "Only farm approver may approve field work calendar.");
  }
  const row = await prisma.field_work_calendars.findFirst({
    where: { farmEstateId, programId, status: "submitted" },
    orderBy: { version: "desc" },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Submitted field work calendar not found.");
  await prisma.field_work_calendars.update({
    where: { id: row.id },
    data: { status: "approved", approvedAt: new Date() },
  });
  return exports.get(user, farmEstateId);
};

exports.returnCalendar = async (user, farmEstateId, comment) => {
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findFirst({
    where: { id: farmEstateId, programId },
  });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm estate not found.");
  if (farm.approverUserId && farm.approverUserId !== user.id) {
    throw new AppError(403, "FORBIDDEN", "Only farm approver may return field work calendar.");
  }
  const row = await prisma.field_work_calendars.findFirst({
    where: { farmEstateId, programId, status: "submitted" },
    orderBy: { version: "desc" },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Submitted field work calendar not found.");
  await prisma.field_work_calendars.update({
    where: { id: row.id },
    data: {
      status: "returned",
      returnedComment: comment || null,
    },
  });
  return exports.get(user, farmEstateId);
};
