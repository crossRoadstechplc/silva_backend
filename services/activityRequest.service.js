const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { parseListQuery, meta } = require("../utils/helpers");
const { isSilvaRole, isSpxRole } = require("../utils/roles");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const afeService = require("./afe.service");

function requestJson(row) {
  return {
    id: row.id,
    programId: row.programId,
    requestType: row.requestType,
    origin: row.origin,
    title: row.title,
    description: row.description,
    urgency: row.urgency,
    blocksOrAreas: row.blocksOrAreas,
    status: row.status,
    requestedByUserId: row.requestedByUserId,
    convertedAfeId: row.convertedAfe?.id || row.convertedAfeId || null,
    dismissalReason: row.dismissalReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

exports.create = async (dto, user) => {
  if (!isSilvaRole(user.role) || !["silva_owner", "silva_country_manager"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only Silva can submit activity requests.");
  }
  const row = await prisma.activity_requests.create({
    data: programCreateData(user, {
      id: uuid("act"),
      requestType: dto.requestType,
      origin: "silva_request",
      title: dto.title,
      description: dto.description,
      urgency: dto.urgency || "normal",
      blocksOrAreas: dto.blocksOrAreas || null,
      requestedByUserId: user.id,
    }),
  });
  return requestJson(row);
};

exports.findAll = async (query, user) => {
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = scopedWhere(user);
  if (query.status) where.status = query.status;
  if (query.origin) where.origin = query.origin;
  if (isSilvaRole(user.role)) {
    where.requestedByUserId = user.id;
  } else if (!isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions.");
  }
  const [rows, total] = await Promise.all([
    prisma.activity_requests.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { convertedAfe: { select: { id: true } } },
    }),
    prisma.activity_requests.count({ where }),
  ]);
  return { items: rows.map(requestJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  const row = await prisma.activity_requests.findFirst({
    where: scopedWhere(user, { id }),
    include: { convertedAfe: { select: { id: true } } },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Activity request not found.");
  if (isSilvaRole(user.role) && row.requestedByUserId !== user.id) {
    throw new AppError(404, "NOT_FOUND", "Activity request not found.");
  }
  return requestJson(row);
};

exports.convert = async (id, dto, user) => {
  if (!["spx_account_handler", "spx_principal", "system_admin"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX Planner can convert activity requests.");
  }
  const row = await prisma.activity_requests.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Activity request not found.");
  if (row.status !== "submitted") throw new AppError(400, "INVALID_STATE", "Request is not open for conversion.");

  const afe = await afeService.createFromIntake(
    {
      afpLineId: dto.afpLineId || null,
      operatingDiscipline: dto.operatingDiscipline,
      description: dto.description || row.description,
      estimatedCostUsd: dto.estimatedCostUsd,
      planningMode: dto.afpLineId ? "planned" : "ad_hoc",
      origin: "silva_request",
      activityRequestId: row.id,
    },
    user,
  );

  await prisma.activity_requests.update({
    where: { id },
    data: { status: "converted", convertedAfeId: afe.id },
  });

  return { request: requestJson({ ...row, status: "converted", convertedAfeId: afe.id }), afe };
};

exports.dismiss = async (id, reason, user) => {
  if (!["spx_account_handler", "spx_principal", "system_admin"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX Planner can dismiss activity requests.");
  }
  const row = await prisma.activity_requests.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Activity request not found.");
  if (row.status !== "submitted") throw new AppError(400, "INVALID_STATE", "Request is not open for dismissal.");
  const updated = await prisma.activity_requests.update({
    where: { id },
    data: { status: "dismissed", dismissalReason: reason },
  });
  return requestJson(updated);
};

exports.requireProgramId = requireProgramId;
