const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid, nextTextId } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { isSilvaRole, isSpxRole } = require("../utils/roles");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const computeBand = require("./utils/computeBand");
const { computeCropfortAfeBand } = require("./costDerivation.service");
const notify = require("./workflowNotifications.service");

const DISCIPLINE_PREFIX = "Discipline: ";

function canSubmitAdHoc(user) {
  return isSilvaRole(user.role) || isSpxRole(user.role);
}

function assertCanSubmit(user) {
  if (!canSubmitAdHoc(user)) {
    throw new AppError(403, "FORBIDDEN", "Only asset owners or SPX can submit core operation requests.");
  }
}

const include = {
  requestedBy: { select: { id: true, name: true, email: true } },
  farmEstate: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  suggestedAfpLine: {
    select: { id: true, activity: true, operatingDiscipline: true, year: true, status: true },
  },
  convertedAfe: { select: { id: true, status: true, band: true, planningMode: true } },
  convertedCropfortAfe: {
    select: { id: true, title: true, status: true, band: true, sourceType: true, amountEtb: true },
  },
  coreOperationProject: {
    select: { id: true, status: true, startDate: true, endDate: true, cropfortAfeId: true },
  },
};

function mapUrgencyIn(value) {
  if (value === "emergency" || value === "urgent") return "urgent";
  if (value === "high") return "high";
  return "normal";
}

function mapUrgencyOut(value) {
  if (value === "urgent") return "emergency";
  return value || "normal";
}

function parseDiscipline(description) {
  if (!description) return "Agronomy";
  const match = String(description).match(/^Discipline:\s*(.+?)(?:\n|$)/i);
  return match ? match[1].trim() : "Agronomy";
}

function stripDiscipline(description) {
  if (!description) return null;
  return String(description).replace(/^Discipline:\s*.+?(?:\n+|$)/i, "").trim() || null;
}

function withDiscipline(discipline, description) {
  const body = description?.trim() || "";
  const disc = String(discipline || "Agronomy").trim();
  return body ? `${DISCIPLINE_PREFIX}${disc}\n${body}` : `${DISCIPLINE_PREFIX}${disc}`;
}

function requestJson(row) {
  const operatingDiscipline = parseDiscipline(row.description);
  const description = stripDiscipline(row.description);
  return {
    id: row.id,
    programId: row.programId,
    title: row.title,
    description,
    operatingDiscipline,
    operationKind: row.operationKind || "intervention",
    requestType: row.requestType,
    urgency: mapUrgencyOut(row.urgency),
    estimatedCostUsd: null,
    estimatedAmountEtb: row.estimatedAmountEtb != null ? Number(row.estimatedAmountEtb) : null,
    plannedStartDate: row.plannedStartDate?.toISOString().slice(0, 10) ?? null,
    plannedEndDate: row.plannedEndDate?.toISOString().slice(0, 10) ?? null,
    blockIds: row.blockIds ?? [],
    activityIds: row.activityIds ?? [],
    farmEstateId: row.farmEstateId,
    suggestedAfpLineId: row.suggestedAfpLineId,
    status: row.status,
    origin: row.origin,
    vendorId: row.vendorId || null,
    requestedByUserId: row.requestedByUserId,
    reviewedByUserId: null,
    reviewedAt: row.dismissedAt?.toISOString() || row.convertedAt?.toISOString() || null,
    reviewNotes: row.dismissalReason,
    convertedAfeId: row.convertedAfeId,
    convertedCropfortAfeId: row.convertedCropfortAfeId,
    submittedAt: row.createdAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    requestedBy: row.requestedBy || undefined,
    farmEstate: row.farmEstate || undefined,
    vendor: row.vendor || undefined,
    suggestedAfpLine: row.suggestedAfpLine || undefined,
    convertedAfe: row.convertedAfe || undefined,
    convertedCropfortAfe: row.convertedCropfortAfe
      ? {
          ...row.convertedCropfortAfe,
          amountEtb: Number(row.convertedCropfortAfe.amountEtb),
        }
      : undefined,
    coreOperationProject: row.coreOperationProject
      ? {
          ...row.coreOperationProject,
          startDate: row.coreOperationProject.startDate?.toISOString().slice(0, 10),
          endDate: row.coreOperationProject.endDate?.toISOString().slice(0, 10),
        }
      : undefined,
  };
}

function parseDateOnly(value, fieldName) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(400, "VALIDATION_ERROR", `${fieldName} is invalid.`);
  }
  return d;
}

function validateProjectDates(dto) {
  const start = parseDateOnly(dto.plannedStartDate, "Start date");
  const end = parseDateOnly(dto.plannedEndDate, "End date");
  if (!start || !end) {
    throw new AppError(400, "VALIDATION_ERROR", "Projects require start and end dates.");
  }
  if (end < start) {
    throw new AppError(400, "VALIDATION_ERROR", "End date must be on or after start date.");
  }
  return { start, end };
}

async function getCropfortBands(programId) {
  return prisma.programs.findUnique({
    where: { id: programId },
    select: {
      cropfortAfeBandAMaxEtb: true,
      cropfortAfeBandBMaxEtb: true,
      cropfortAfeBandCMaxEtb: true,
    },
  });
}

function assertSpx(user) {
  if (!isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX roles can triage ad-hoc requests.");
  }
}

function assertCanAccess(user) {
  if (!isSilvaRole(user.role) && !isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Core operations are for asset owners and SPX only.");
  }
}

async function getScoped(id, user) {
  const where = scopedWhere(user, { id });
  if (isSilvaRole(user.role)) {
    where.origin = "silva_request";
  }
  const row = await prisma.activity_requests.findFirst({
    where,
    include,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Ad-hoc request not found.");
  return row;
}

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

function requestTypeFromUrgency(urgency) {
  return urgency === "urgent" || urgency === "emergency" ? "urgent_field_work" : "other";
}

exports.findAll = async (query, user) => {
  requireProgramId(user);
  assertCanAccess(user);
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = scopedWhere(user, {});

  if (isSilvaRole(user.role)) {
    where.origin = "silva_request";
  } else if (query.origin === "silva_request" || query.origin === "vendor_request") {
    where.origin = query.origin;
  }

  if (query.status) {
    if (query.status === "draft") {
      return { items: [], meta: meta(page, pageSize, 0) };
    }
    where.status = query.status;
  }
  if (query.urgency) where.urgency = mapUrgencyIn(query.urgency);
  if (query.operationKind === "intervention" || query.operationKind === "project") {
    where.operationKind = query.operationKind;
  }
  if (query.dateFrom || query.dateTo) {
    const from = query.dateFrom ? parseDateOnly(query.dateFrom, "dateFrom") : null;
    const to = query.dateTo ? parseDateOnly(query.dateTo, "dateTo") : null;
    if (from || to) {
      where.AND = where.AND || [];
      if (from) {
        where.AND.push({
          OR: [
            { plannedStartDate: { gte: from } },
            { plannedStartDate: null, createdAt: { gte: from } },
          ],
        });
      }
      if (to) {
        where.AND.push({
          OR: [
            { plannedEndDate: { lte: to } },
            { plannedEndDate: null, createdAt: { lte: to } },
          ],
        });
      }
    }
  }

  const [rows, total] = await Promise.all([
    prisma.activity_requests.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      include,
    }),
    prisma.activity_requests.count({ where }),
  ]);
  return { items: rows.map(requestJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  assertCanAccess(user);
  return requestJson(await getScoped(id, user));
};

exports.create = async (dto, user) => {
  assertCanSubmit(user);
  const programId = requireProgramId(user);
  const title = String(dto.title || "").trim();
  if (!title) throw new AppError(400, "VALIDATION_ERROR", "Title is required.");

  if (dto.farmEstateId) {
    const estate = await prisma.farm_estates.findFirst({
      where: { id: dto.farmEstateId, programId, status: "active" },
    });
    if (!estate) throw new AppError(404, "NOT_FOUND", "Farm estate not found.");
  }

  const urgency = mapUrgencyIn(dto.urgency);
  const operationKind = dto.operationKind === "project" ? "project" : "intervention";
  let plannedStartDate = null;
  let plannedEndDate = null;
  if (operationKind === "project") {
    const dates = validateProjectDates(dto);
    plannedStartDate = dates.start;
    plannedEndDate = dates.end;
  }

  const blockIds = Array.isArray(dto.blockIds) ? dto.blockIds.filter(Boolean) : [];
  const activityIds = Array.isArray(dto.activityIds) ? dto.activityIds.filter(Boolean) : [];
  const estimatedAmountEtb =
    dto.estimatedAmountEtb != null && Number(dto.estimatedAmountEtb) > 0
      ? decimal(Number(dto.estimatedAmountEtb))
      : null;

  const row = await prisma.activity_requests.create({
    data: programCreateData(user, {
      id: uuid("ahr"),
      title,
      description: withDiscipline(dto.operatingDiscipline || "Agronomy", dto.description),
      urgency: operationKind === "project" ? "normal" : urgency,
      requestType: operationKind === "project" ? "other" : requestTypeFromUrgency(dto.urgency),
      operationKind,
      plannedStartDate,
      plannedEndDate,
      blockIds,
      activityIds,
      estimatedAmountEtb,
      origin: "silva_request",
      status: "submitted",
      farmEstateId: dto.farmEstateId || null,
      suggestedAfpLineId: null,
      requestedByUserId: user.id,
      vendorId: null,
    }),
    include,
  });

  await notify.adHocRequestSubmitted(row);
  return requestJson(row);
};

exports.update = async (id, dto, user) => {
  assertCanSubmit(user);
  const row = await getScoped(id, user);
  if (row.requestedByUserId !== user.id) {
    throw new AppError(403, "FORBIDDEN", "Only the requester can edit this request.");
  }
  if (row.status !== "submitted") {
    throw new AppError(400, "INVALID_STATE", "Only submitted requests can be edited.");
  }

  const data = {};
  if (dto.title !== undefined) data.title = String(dto.title).trim();
  if (dto.urgency !== undefined) {
    data.urgency = mapUrgencyIn(dto.urgency);
    data.requestType = requestTypeFromUrgency(dto.urgency);
  }
  if (dto.farmEstateId !== undefined) data.farmEstateId = dto.farmEstateId || null;
  if (dto.blockIds !== undefined) data.blockIds = Array.isArray(dto.blockIds) ? dto.blockIds.filter(Boolean) : [];
  if (dto.activityIds !== undefined) {
    data.activityIds = Array.isArray(dto.activityIds) ? dto.activityIds.filter(Boolean) : [];
  }
  if (dto.estimatedAmountEtb !== undefined) {
    data.estimatedAmountEtb =
      dto.estimatedAmountEtb != null && Number(dto.estimatedAmountEtb) > 0
        ? decimal(Number(dto.estimatedAmountEtb))
        : null;
  }
  if (dto.plannedStartDate !== undefined || dto.plannedEndDate !== undefined) {
    if (row.operationKind !== "project") {
      throw new AppError(400, "VALIDATION_ERROR", "Only projects can have planned dates.");
    }
    const dates = validateProjectDates({
      plannedStartDate: dto.plannedStartDate ?? row.plannedStartDate,
      plannedEndDate: dto.plannedEndDate ?? row.plannedEndDate,
    });
    data.plannedStartDate = dates.start;
    data.plannedEndDate = dates.end;
  }
  if (dto.description !== undefined || dto.operatingDiscipline !== undefined) {
    const discipline = dto.operatingDiscipline || parseDiscipline(row.description);
    const body = dto.description !== undefined ? dto.description : stripDiscipline(row.description);
    data.description = withDiscipline(discipline, body);
  }

  const updated = await prisma.activity_requests.update({
    where: { id },
    data,
    include,
  });
  return requestJson(updated);
};

exports.submit = async (id, user) => {
  assertCanSubmit(user);
  const row = await getScoped(id, user);
  if (row.requestedByUserId !== user.id) {
    throw new AppError(403, "FORBIDDEN", "Only the requester can submit this request.");
  }
  return requestJson(row);
};

exports.dismiss = async (id, notes, user) => {
  assertSpx(user);
  const row = await getScoped(id, user);
  if (row.status !== "submitted") {
    throw new AppError(400, "INVALID_STATE", "Only submitted requests can be dismissed.");
  }
  const reason = String(notes || "").trim();
  if (!reason) throw new AppError(400, "VALIDATION_ERROR", "Dismissal reason is required.");

  const updated = await prisma.activity_requests.update({
    where: { id },
    data: {
      status: "dismissed",
      dismissedAt: new Date(),
      dismissalReason: reason,
    },
    include,
  });
  await notify.adHocRequestDismissed({ ...updated, reviewNotes: reason });
  return requestJson(updated);
};

/**
 * SPX converts Silva/vendor ad-hoc request → AFE (optionally linked to an AFP line).
 */
exports.convertToAfe = async (id, dto, user) => {
  assertSpx(user);
  const row = await getScoped(id, user);
  if (row.status !== "submitted") {
    throw new AppError(400, "INVALID_STATE", "Only submitted requests can be converted.");
  }

  const programId = requireProgramId(user);
  const afpLineId =
    dto.afpLineId && String(dto.afpLineId).trim() && String(dto.afpLineId).trim() !== "none"
      ? String(dto.afpLineId).trim()
      : null;
  if (afpLineId) {
    const afp = await prisma.afp_lines.findFirst({ where: { id: afpLineId, programId } });
    if (!afp) throw new AppError(404, "NOT_FOUND", "AFP line not found.");
  }

  const cost = dto.estimatedCostEtb != null ? Number(dto.estimatedCostEtb) : null;
  if (cost == null || !(cost > 0)) {
    throw new AppError(400, "VALIDATION_ERROR", "Estimated cost (ETB) is required to convert.");
  }

  const discipline = dto.operatingDiscipline || parseDiscipline(row.description);
  const description = dto.description || row.title;
  const thresholds = await getThresholds(programId);
  const band = computeBand(cost, thresholds);
  const silvaApprovalRequired = band === "C" || band === "D";
  const afeId = await nextTextId("afe", "AFE");
  const afeOrigin = row.origin === "vendor_request" ? "vendor_request" : "silva_request";

  const result = await prisma.$transaction(async (tx) => {
    const afe = await tx.afes.create({
      data: programCreateData(user, {
        id: afeId,
        ...(afpLineId ? { afpLineId } : { afpLineId: null }),
        operatingDiscipline: discipline,
        description,
        estimatedCostUsd: decimal(cost),
        band,
        planningMode: "ad_hoc",
        origin: afeOrigin,
        activityRequestId: id,
        silvaApprovalRequired,
        createdByUserId: user.id,
      }),
    });

    const updated = await tx.activity_requests.update({
      where: { id },
      data: {
        status: "converted",
        convertedAfeId: afe.id,
        convertedAt: new Date(),
        suggestedAfpLineId: afpLineId,
      },
      include,
    });

    return { afe, request: updated };
  });

  await notify.adHocRequestConverted(result.request, result.afe);
  return {
    request: requestJson(result.request),
    afe: {
      id: result.afe.id,
      status: result.afe.status,
      band: result.afe.band,
      planningMode: result.afe.planningMode,
      afpLineId: result.afe.afpLineId,
    },
  };
};

/**
 * SPX converts core operation request → Cropfort AFE (intervention or project).
 */
exports.convertToCropfortAfe = async (id, dto, user) => {
  assertSpx(user);
  const row = await getScoped(id, user);
  if (row.status !== "submitted") {
    throw new AppError(400, "INVALID_STATE", "Only submitted requests can be converted.");
  }

  const programId = requireProgramId(user);
  const amountEtb = dto.amountEtb != null ? Number(dto.amountEtb) : Number(row.estimatedAmountEtb);
  if (!(amountEtb > 0)) {
    throw new AppError(400, "VALIDATION_ERROR", "Amount (ETB) is required to convert.");
  }

  const program = await getCropfortBands(programId);
  if (!program) throw new AppError(404, "NOT_FOUND", "Program not found.");
  const band = computeCropfortAfeBand(amountEtb, program);
  const sourceType = row.operationKind === "project" ? "project" : "intervention";
  const title = (dto.title || row.title).trim();
  const afeId = uuid("caf");

  const result = await prisma.$transaction(async (tx) => {
    const afe = await tx.cropfort_afes.create({
      data: {
        id: afeId,
        programId,
        title,
        amountEtb: decimal(amountEtb),
        band,
        sourceType,
        sourceId: id,
        createdByUserId: user.id,
      },
    });

    let project = null;
    if (row.operationKind === "project") {
      const startDate = row.plannedStartDate;
      const endDate = row.plannedEndDate;
      if (!startDate || !endDate) {
        throw new AppError(400, "VALIDATION_ERROR", "Project requests require planned dates.");
      }
      project = await tx.core_operation_projects.create({
        data: {
          id: uuid("cop"),
          programId,
          requestId: id,
          cropfortAfeId: afe.id,
          title,
          startDate,
          endDate,
          blockIds: row.blockIds ?? [],
          activityIds: row.activityIds ?? [],
          status: "active",
        },
      });
    }

    const updated = await tx.activity_requests.update({
      where: { id },
      data: {
        status: "converted",
        convertedCropfortAfeId: afe.id,
        convertedAt: new Date(),
      },
      include,
    });

    return { afe, request: updated, project };
  });

  return {
    request: requestJson(result.request),
    cropfortAfe: {
      id: result.afe.id,
      title: result.afe.title,
      status: result.afe.status,
      band: result.afe.band,
      sourceType: result.afe.sourceType,
      amountEtb: Number(result.afe.amountEtb),
    },
    project: result.project
      ? {
          id: result.project.id,
          status: result.project.status,
          startDate: result.project.startDate.toISOString().slice(0, 10),
          endDate: result.project.endDate.toISOString().slice(0, 10),
        }
      : null,
  };
};

exports.stats = async (user) => {
  requireProgramId(user);
  assertCanAccess(user);
  const programId = requireProgramId(user);
  const baseWhere = scopedWhere(user, { programId, status: "submitted" });

  const [submittedInterventions, submittedProjects, activeProjects] = await Promise.all([
    prisma.activity_requests.count({ where: { ...baseWhere, operationKind: "intervention" } }),
    prisma.activity_requests.count({ where: { ...baseWhere, operationKind: "project" } }),
    prisma.core_operation_projects.count({ where: { programId, status: "active" } }),
  ]);

  return { submittedInterventions, submittedProjects, activeProjects };
};
