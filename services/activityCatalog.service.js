const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { scopedWhere, requireProgramId } = require("./utils/programScope");
const { isVendorRole } = require("../utils/roles");
const { money } = require("../utils/helpers");

function catalogJson(row) {
  return {
    id: row.id,
    programId: row.programId,
    afpLineId: row.afpLineId,
    sectionCode: row.sectionCode,
    sectionLabel: row.sectionLabel,
    sortOrder: row.sortOrder,
    nameEn: row.nameEn,
    nameAm: row.nameAm,
    unit: row.unit,
    normMdPerUnit: row.normMdPerUnit != null ? Number(row.normMdPerUnit) : null,
    normCostEtb: row.normCostEtb != null ? Number(row.normCostEtb) : null,
    normWageEtb: row.normWageEtb != null ? Number(row.normWageEtb) : null,
    normsPerMd: row.normsPerMd != null ? Number(row.normsPerMd) : null,
    annualQuantity: row.annualQuantity != null ? Number(row.annualQuantity) : null,
    annualMandays: row.annualMandays != null ? Number(row.annualMandays) : null,
    annualCostEtb: row.annualCostEtb != null ? money(row.annualCostEtb) : null,
    scope: row.scopeJson,
    schedules: row.schedules?.map((s) => ({
      year: s.year,
      month: s.month,
      plannedQuantity: s.plannedQuantity != null ? Number(s.plannedQuantity) : null,
      plannedMandays: s.plannedMandays != null ? Number(s.plannedMandays) : null,
      plannedCostEtb: s.plannedCostEtb != null ? money(s.plannedCostEtb) : null,
    })),
  };
}

exports.list = async (query, user) => {
  requireProgramId(user);
  const where = scopedWhere(user);
  if (query.afpLineId) where.afpLineId = query.afpLineId;
  if (query.sectionCode) where.sectionCode = query.sectionCode;

  const rows = await prisma.activity_catalog.findMany({
    where,
    orderBy: [{ sectionCode: "asc" }, { sortOrder: "asc" }],
    include: { schedules: { orderBy: { month: "asc" } } },
  });

  return rows.map(catalogJson);
};

exports.findOne = async (id, user) => {
  const row = await prisma.activity_catalog.findFirst({
    where: scopedWhere(user, { id }),
    include: { schedules: { orderBy: { month: "asc" } } },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Activity not found.");
  return catalogJson(row);
};

exports.sectionSummary = async (afpLineId, user) => {
  const rows = await exports.list({ afpLineId }, user);
  const totalMandays = rows.reduce((s, r) => s + (r.annualMandays || 0), 0);
  const totalCostEtb = rows.reduce((s, r) => s + (r.annualCostEtb || 0), 0);
  return {
    afpLineId,
    activityCount: rows.length,
    totalMandays,
    totalCostEtb,
    activities: rows,
  };
};
