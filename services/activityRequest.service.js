const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const computeBand = require("./utils/computeBand");
const { uuid, nextTextId } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { afeJson } = require("../utils/serializers");
const { isVendorRole, isSpxRole, isSilvaRole } = require("../utils/roles");
const notify = require("./workflowNotifications.service");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");

const SILVA_CREATE = ["silva_owner", "silva_country_manager"];
const VENDOR_CREATE = ["vendor_admin", "vendor_manager", "vendor_field_lead"];
const SPX_CONVERT = ["spx_principal", "spx_account_handler"];

function requestJson(row) {
  return {
    id: row.id,
    programId: row.programId,
    farmEstateId: row.farmEstateId ?? null,
    requestType: row.requestType,
    title: row.title,
    description: row.description ?? null,
    urgency: row.urgency,
    blocksOrAreas: row.blocksOrAreas ?? null,
    blockCode: row.blockCode ?? null,
    status: row.status,
    origin: row.origin,
    requestedByUserId: row.requestedByUserId,
    vendorId: row.vendorId ?? null,
    activityCatalogId: row.activityCatalogId ?? null,
    workPlanSubmissionId: row.workPlanSubmissionId ?? null,
    suggestedAfpLineId: row.suggestedAfpLineId ?? null,
    convertedAfeId: row.convertedAfeId ?? row.convertedAfe?.id ?? null,
    dismissalReason: row.dismissalReason ?? null,
    convertedAt: row.convertedAt ? row.convertedAt.toISOString() : null,
    dismissedAt: row.dismissedAt ? row.dismissedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    farmEstate: row.farmEstate
      ? { id: row.farmEstate.id, name: row.farmEstate.name }
      : null,
    activityCatalog: row.activityCatalog
      ? {
          id: row.activityCatalog.id,
          nameEn: row.activityCatalog.nameEn,
          sectionLabel: row.activityCatalog.sectionLabel,
          afpLineId: row.activityCatalog.afpLineId,
        }
      : null,
    suggestedAfpLine: row.suggestedAfpLine
      ? {
          id: row.suggestedAfpLine.id,
          activity: row.suggestedAfpLine.activity,
          operatingDiscipline: row.suggestedAfpLine.operatingDiscipline,
        }
      : null,
    requestedBy: row.requestedBy
      ? { id: row.requestedBy.id, name: row.requestedBy.name, email: row.requestedBy.email }
      : null,
    convertedAfe: row.convertedAfe ? afeJson(row.convertedAfe) : null,
  };
}

const listInclude = {
  farmEstate: true,
  activityCatalog: true,
  suggestedAfpLine: true,
  requestedBy: { select: { id: true, name: true, email: true } },
  convertedAfe: true,
};

async function getThresholds(programId) {
  const rows = await prisma.schedule3_thresholds.findMany({ where: { programId } });
  return rows.length
    ? rows
    : [
        { band: "A", minValueUsd: 0, maxValueUsd: 5000 },
        { band: "B", minValueUsd: 5001, maxValueUsd: 20000 },
        { band: "C", minValueUsd: 20001, maxValueUsd: 50000 },
        { band: "D", minValueUsd: 50001, maxValueUsd: null },
      ];
}

function assertCanCreate(user) {
  if (SILVA_CREATE.includes(user.role) || VENDOR_CREATE.includes(user.role)) return;
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to create activity requests.");
}

function assertCanConvert(user) {
  if (!SPX_CONVERT.includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX Planner / Executive can convert activity requests.");
  }
}

function visibilityWhere(user, extra = {}) {
  const where = scopedWhere(user, extra);
  if (isSilvaRole(user.role)) {
    where.origin = "silva_request";
    where.requestedByUserId = user.role === "silva_finance" ? user.id : undefined;
    if (user.role === "silva_finance") {
      where.requestedByUserId = user.id;
    } else {
      delete where.requestedByUserId;
      // Silva owner/CM see all Silva-origin requests in the program
      where.origin = "silva_request";
    }
  } else if (isVendorRole(user.role)) {
    where.vendorId = user.vendorId;
    where.origin = "vendor_request";
  } else if (!isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  return where;
}

exports.findAll = async (query, user) => {
  requireProgramId(user);
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = visibilityWhere(user);
  if (query.status) where.status = query.status;
  if (query.origin && isSpxRole(user.role)) where.origin = query.origin;
  const [rows, total] = await Promise.all([
    prisma.activity_requests.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: listInclude,
    }),
    prisma.activity_requests.count({ where }),
  ]);
  return { items: rows.map(requestJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  requireProgramId(user);
  const row = await prisma.activity_requests.findFirst({
    where: visibilityWhere(user, { id }),
    include: listInclude,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Activity request not found.");
  return requestJson(row);
};

exports.create = async (dto, user) => {
  assertCanCreate(user);
  const programId = requireProgramId(user);
  const isVendor = isVendorRole(user.role);
  const isSilva = isSilvaRole(user.role);

  let suggestedAfpLineId = dto.suggestedAfpLineId || null;
  let activityCatalogId = dto.activityCatalogId || null;
  let workPlanSubmissionId = dto.workPlanSubmissionId || null;
  let farmEstateId = dto.farmEstateId || null;

  if (activityCatalogId) {
    const cat = await prisma.activity_catalog.findFirst({
      where: { id: activityCatalogId, programId },
      include: { afpLine: true },
    });
    if (!cat) throw new AppError(404, "NOT_FOUND", "Activity catalog entry not found.");
    suggestedAfpLineId = suggestedAfpLineId || cat.afpLineId;
  }

  if (workPlanSubmissionId) {
    const plan = await prisma.work_plan_submissions.findFirst({
      where: { id: workPlanSubmissionId, programId, status: "accepted" },
    });
    if (!plan) throw new AppError(404, "NOT_FOUND", "Accepted work plan not found.");
    farmEstateId = farmEstateId || plan.farmEstateId;
  }

  if (farmEstateId) {
    const estate = await prisma.farm_estates.findFirst({ where: { id: farmEstateId, programId } });
    if (!estate) throw new AppError(404, "NOT_FOUND", "Farm estate not found.");
  }

  if (suggestedAfpLineId) {
    const line = await prisma.afp_lines.findFirst({ where: { id: suggestedAfpLineId, programId } });
    if (!line) throw new AppError(404, "NOT_FOUND", "AFP line not found.");
  }

  const row = await prisma.activity_requests.create({
    data: programCreateData(user, {
      id: uuid("act"),
      requestType: dto.requestType,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      urgency: dto.urgency || "normal",
      blocksOrAreas: dto.blocksOrAreas?.trim() || null,
      blockCode: dto.blockCode?.trim() || null,
      origin: isVendor ? "vendor_request" : "silva_request",
      requestedByUserId: user.id,
      vendorId: isVendor ? user.vendorId : null,
      farmEstateId,
      activityCatalogId,
      workPlanSubmissionId,
      suggestedAfpLineId,
      status: "submitted",
    }),
    include: listInclude,
  });

  await notify.activityRequestSubmitted(row);
  return requestJson(row);
};

exports.convert = async (id, dto, user) => {
  assertCanConvert(user);
  const programId = requireProgramId(user);
  const existing = await prisma.activity_requests.findFirst({
    where: scopedWhere(user, { id }),
    include: { suggestedAfpLine: true, activityCatalog: true },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Activity request not found.");
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATE", "Only submitted requests can be converted.");
  }

  const unlinkAfp = dto.unlinkAfp === true;
  let afpLineId = unlinkAfp ? null : dto.afpLineId || existing.suggestedAfpLineId || null;

  if (afpLineId) {
    const afp = await prisma.afp_lines.findFirst({ where: { id: afpLineId, programId } });
    if (!afp) throw new AppError(404, "NOT_FOUND", "AFP line not found.");
  }

  const operatingDiscipline =
    dto.operatingDiscipline ||
    existing.suggestedAfpLine?.operatingDiscipline ||
    existing.activityCatalog?.sectionLabel ||
    "Quality";
  const description = dto.description?.trim() || existing.description || existing.title;
  const estimatedCostUsd = Number(dto.estimatedCostUsd);
  if (!(estimatedCostUsd > 0)) {
    throw new AppError(400, "VALIDATION_ERROR", "estimatedCostUsd must be a positive number.");
  }

  const thresholds = await getThresholds(programId);
  const band = computeBand(estimatedCostUsd, thresholds);
  const silvaApprovalRequired = band === "C" || band === "D";
  const afeId = await nextTextId("afe", "AFE");
  const origin = existing.origin === "vendor_request" ? "vendor_request" : "silva_request";

  const result = await prisma.$transaction(async (tx) => {
    const afe = await tx.afes.create({
      data: {
        id: afeId,
        programId,
        afpLineId,
        operatingDiscipline,
        description,
        estimatedCostUsd: decimal(estimatedCostUsd),
        band,
        silvaApprovalRequired,
        planningMode: "ad_hoc",
        origin,
        activityRequestId: existing.id,
        createdByUserId: user.id,
        status: "draft",
      },
    });
    const request = await tx.activity_requests.update({
      where: { id: existing.id },
      data: {
        status: "converted",
        convertedAfeId: afe.id,
        convertedAt: new Date(),
      },
      include: listInclude,
    });
    return { afe, request };
  });

  await notify.activityRequestConverted(result.request, result.afe);
  return {
    ...requestJson(result.request),
    convertedAfe: afeJson(result.afe),
  };
};

exports.dismiss = async (id, dto, user) => {
  assertCanConvert(user);
  const existing = await prisma.activity_requests.findFirst({
    where: scopedWhere(user, { id }),
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Activity request not found.");
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATE", "Only submitted requests can be dismissed.");
  }
  const reason = (dto.reason || "").trim();
  if (!reason) throw new AppError(400, "VALIDATION_ERROR", "Dismissal reason is required.");

  const row = await prisma.activity_requests.update({
    where: { id },
    data: {
      status: "dismissed",
      dismissalReason: reason,
      dismissedAt: new Date(),
    },
    include: listInclude,
  });
  await notify.activityRequestDismissed(row);
  return requestJson(row);
};

/** Read-only vendor work list for request picker (no cost build-up for Silva). */
exports.workListOptions = async (user) => {
  const programId = requireProgramId(user);
  const year = new Date().getUTCFullYear();

  const acceptedPlans = await prisma.work_plan_submissions.findMany({
    where: {
      programId,
      status: "accepted",
      ...(isVendorRole(user.role) ? { vendorId: user.vendorId } : {}),
    },
    orderBy: { promotedAt: "desc" },
    take: 8,
    include: { farmEstate: true, vendor: true },
  });

  const catalog = await prisma.activity_catalog.findMany({
    where: { programId },
    orderBy: [{ sectionCode: "asc" }, { sortOrder: "asc" }],
    take: 200,
    include: {
      afpLine: { select: { id: true, activity: true, operatingDiscipline: true, year: true, status: true } },
    },
  });

  const afpLines = await prisma.afp_lines.findMany({
    where: { programId, year: { in: [year, year + 1, year - 1] } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      year: true,
      operatingDiscipline: true,
      activity: true,
      status: true,
      workPlanSubmissionId: true,
    },
  });

  return {
    workPlans: acceptedPlans.map((p) => ({
      id: p.id,
      budgetYearLabel: p.budgetYearLabel,
      budgetYearGc: p.budgetYearGc,
      farmEstateId: p.farmEstateId,
      farmEstateName: p.farmEstate?.name || p.farmName || null,
      vendorName: p.vendor?.name || null,
      sections: (p.parsedJson?.sections || []).map((s) => ({
        sectionCode: s.sectionCode,
        sectionLabel: s.sectionLabel,
        afpLineId: s.afpLineId,
        activities: (s.activities || [])
          .filter((a) => a.enabled !== false)
          .map((a) => ({
            id: a.id,
            nameEn: a.nameEn,
            unit: a.unit,
          })),
      })),
    })),
    catalog: catalog.map((c) => ({
      id: c.id,
      nameEn: c.nameEn,
      sectionCode: c.sectionCode,
      sectionLabel: c.sectionLabel,
      afpLineId: c.afpLineId,
      operatingDiscipline: c.afpLine?.operatingDiscipline || c.sectionLabel,
      afpActivity: c.afpLine?.activity || null,
    })),
    afpLines,
  };
};
