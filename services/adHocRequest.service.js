const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid, nextTextId } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { isSilvaRole, isSpxRole } = require("../utils/roles");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const computeBand = require("./utils/computeBand");
const notify = require("./workflowNotifications.service");

const DISCIPLINE_PREFIX = "Discipline: ";

const include = {
  requestedBy: { select: { id: true, name: true, email: true } },
  farmEstate: { select: { id: true, name: true } },
  suggestedAfpLine: {
    select: { id: true, activity: true, operatingDiscipline: true, year: true, status: true },
  },
  convertedAfe: { select: { id: true, status: true, band: true, planningMode: true } },
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
    requestType: row.requestType,
    urgency: mapUrgencyOut(row.urgency),
    estimatedCostUsd: null,
    farmEstateId: row.farmEstateId,
    suggestedAfpLineId: row.suggestedAfpLineId,
    status: row.status,
    origin: row.origin,
    requestedByUserId: row.requestedByUserId,
    reviewedByUserId: null,
    reviewedAt: row.dismissedAt?.toISOString() || row.convertedAt?.toISOString() || null,
    reviewNotes: row.dismissalReason,
    convertedAfeId: row.convertedAfeId,
    submittedAt: row.createdAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    requestedBy: row.requestedBy || undefined,
    farmEstate: row.farmEstate || undefined,
    suggestedAfpLine: row.suggestedAfpLine || undefined,
    convertedAfe: row.convertedAfe || undefined,
  };
}

function assertSilva(user) {
  if (!isSilvaRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only asset owner (Silva) roles can submit ad-hoc requests.");
  }
}

function assertSpx(user) {
  if (!isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX roles can triage ad-hoc requests.");
  }
}

async function getScoped(id, user) {
  const row = await prisma.activity_requests.findFirst({
    where: scopedWhere(user, { id }),
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
  if (!isSilvaRole(user.role) && !isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Ad-hoc requests are for Silva and SPX.");
  }
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = scopedWhere(user, { origin: "silva_request" });
  if (query.status) {
    if (query.status === "draft") {
      return { items: [], meta: meta(page, pageSize, 0) };
    }
    where.status = query.status;
  }
  if (query.urgency) where.urgency = mapUrgencyIn(query.urgency);

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

exports.findOne = async (id, user) => requestJson(await getScoped(id, user));

exports.create = async (dto, user) => {
  assertSilva(user);
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
  const row = await prisma.activity_requests.create({
    data: programCreateData(user, {
      id: uuid("ahr"),
      title,
      description: withDiscipline(dto.operatingDiscipline || "Agronomy", dto.description),
      urgency,
      requestType: requestTypeFromUrgency(dto.urgency),
      origin: "silva_request",
      status: "submitted",
      farmEstateId: dto.farmEstateId || null,
      suggestedAfpLineId: null,
      requestedByUserId: user.id,
    }),
    include,
  });

  await notify.adHocRequestSubmitted(row);
  return requestJson(row);
};

exports.update = async (id, dto, user) => {
  assertSilva(user);
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
  assertSilva(user);
  const row = await getScoped(id, user);
  if (row.requestedByUserId !== user.id) {
    throw new AppError(403, "FORBIDDEN", "Only the requester can submit this request.");
  }
  // Existing table has no draft state — create already submits.
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
 * SPX converts Silva ad-hoc request → AFE (optionally linked to an AFP line).
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

  const cost = dto.estimatedCostUsd != null ? Number(dto.estimatedCostUsd) : null;
  if (cost == null || !(cost > 0)) {
    throw new AppError(400, "VALIDATION_ERROR", "Estimated cost (USD) is required to convert.");
  }

  const discipline = dto.operatingDiscipline || parseDiscipline(row.description);
  const description = dto.description || row.title;
  const thresholds = await getThresholds(programId);
  const band = computeBand(cost, thresholds);
  const silvaApprovalRequired = band === "C" || band === "D";
  const afeId = await nextTextId("afe", "AFE");

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
        origin: "silva_request",
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
