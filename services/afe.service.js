const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const computeBand = require("./utils/computeBand");
const { nextTextId } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { afeJson, auditJson } = require("../utils/serializers");
const { isVendorRole, isSpxRole } = require("../utils/roles");
const { createNotification } = require("../jobs/queues");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const { assertAfpBudgetAvailable } = require("./utils/afpBudget");

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

function resolvePlanning(dto, user) {
  let planningMode = dto.planningMode || "planned";
  let origin = dto.origin || "spx_initiated";
  if (isVendorRole(user.role)) {
    planningMode = "ad_hoc";
    origin = "vendor_request";
  }
  return { planningMode, origin };
}

async function createAfeRecord(dto, user, extra = {}) {
  const programId = requireProgramId(user);
  const { planningMode, origin } = resolvePlanning(dto, user);
  const afpLineId = dto.afpLineId || null;

  if (planningMode === "planned" && !afpLineId) {
    throw new AppError(422, "BUSINESS_RULE_VIOLATION", "Planned AFEs require an AFP line.");
  }

  if (afpLineId) {
    await assertAfpBudgetAvailable({
      programId,
      afpLineId,
      additionalUsd: dto.estimatedCostUsd,
      excludeAfeId: extra.excludeAfeId,
    });
  }

  const thresholds = await getThresholds(programId);
  const band = computeBand(dto.estimatedCostUsd, thresholds);
  const silvaApprovalRequired = band === "C" || band === "D";
  const id = await nextTextId("afe", "AFE");

  const afe = await prisma.afes.create({
    data: programCreateData(user, {
      id,
      afpLineId,
      operatingDiscipline: dto.operatingDiscipline,
      description: dto.description,
      estimatedCostUsd: decimal(dto.estimatedCostUsd),
      band,
      planningMode,
      origin,
      activityRequestId: dto.activityRequestId || null,
      silvaApprovalRequired,
      createdByUserId: user.id,
    }),
  });
  return afeJson(afe);
}

exports.findAll = async (query, user) => {
  if (isVendorRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Vendors cannot access AFE register");
  }
  const { page, pageSize, skip, take, statuses } = parseListQuery(query);
  const where = scopedWhere(user);
  if (statuses.length) where.status = { in: statuses };
  if (query.band) where.band = query.band;
  if (query.afpLineId) where.afpLineId = query.afpLineId;
  if (query.planningMode) where.planningMode = query.planningMode;
  if (query.silvaApprovalRequired === "true") where.silvaApprovalRequired = true;
  if (query.silvaApprovalRequired === "false") where.silvaApprovalRequired = false;
  const [rows, total] = await Promise.all([
    prisma.afes.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.afes.count({ where }),
  ]);
  return { items: rows.map(afeJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }) });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (isVendorRole(user.role) && afe.createdByUserId !== user.id) {
    throw new AppError(404, "NOT_FOUND", "AFE not found");
  }
  return afeJson(afe);
};

exports.create = async (dto, user) => createAfeRecord(dto, user);

exports.createFromIntake = async (dto, user) => createAfeRecord(dto, user);

exports.update = async (id, dto, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }) });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (afe.status !== "draft") throw new AppError(400, "INVALID_STATE", "Only draft records can be edited.");
  if (isVendorRole(user.role) && afe.createdByUserId !== user.id) {
    throw new AppError(404, "NOT_FOUND", "AFE not found");
  }
  const cost = dto.estimatedCostUsd !== undefined ? dto.estimatedCostUsd : Number(afe.estimatedCostUsd);
  const afpLineId = dto.afpLineId !== undefined ? dto.afpLineId : afe.afpLineId;
  if (afe.planningMode === "planned" && afpLineId) {
    await assertAfpBudgetAvailable({
      programId: requireProgramId(user),
      afpLineId,
      additionalUsd: cost,
      excludeAfeId: id,
    });
  }
  const thresholds = await getThresholds(requireProgramId(user));
  const band = computeBand(cost, thresholds);
  const updated = await prisma.afes.update({
    where: { id },
    data: {
      operatingDiscipline: dto.operatingDiscipline ?? afe.operatingDiscipline,
      description: dto.description ?? afe.description,
      estimatedCostUsd: decimal(cost),
      afpLineId: afpLineId || null,
      band,
      silvaApprovalRequired: band === "C" || band === "D",
    },
  });
  return afeJson(updated);
};

exports.submit = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }) });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (afe.status === "submitted") return afeJson(afe);
  if (afe.status !== "draft") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  const updated = await prisma.afes.update({ where: { id }, data: { status: "submitted" } });
  return afeJson(updated);
};

exports.validate = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }) });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (["validated", "approved", "active"].includes(afe.status) && afe.spxValidated) return afeJson(afe);
  if (afe.status !== "submitted") throw new AppError(400, "INVALID_STATE", "AFE must be submitted to validate.");
  if (afe.createdByUserId === user.id) {
    throw new AppError(409, "MAKER_CHECKER_VIOLATION", "Actor cannot approve own submission.");
  }
  let nextStatus = "validated";
  let approvalDate = afe.approvalDate;
  if (afe.band === "A" || afe.band === "B") {
    nextStatus = "approved";
    approvalDate = new Date();
  }
  const updated = await prisma.afes.update({
    where: { id },
    data: { status: nextStatus, spxValidated: true, silvaApproved: false, approvalDate },
  });
  if (afe.band === "B") {
    await createNotification({
      programId: afe.programId,
      triggerType: "afe_pending",
      entityType: "afe",
      entityId: id,
      recipientRole: "silva_owner",
      message: `${id} Band B issued by SPX — Silva may object within 5 business days (silence is deemed approval).`,
    });
  } else if (afe.silvaApprovalRequired) {
    await createNotification({
      programId: afe.programId,
      triggerType: "afe_pending",
      entityType: "afe",
      entityId: id,
      recipientRole: "silva_owner",
      message: `${id} (${afe.band}) requires Silva written approval before the AFE issues.`,
    });
  }
  return afeJson(updated);
};

exports.approve = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }) });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (afe.status === "approved" || afe.status === "active") return afeJson(afe);

  const isSilva = user.organizationType === "silva";
  const isSPX = user.organizationType === "spx";

  if (afe.band === "C" || afe.band === "D") {
    if (!isSilva || !["silva_owner", "silva_country_manager"].includes(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Only Silva can approve Band C/D AFEs");
    }
    if (afe.status !== "validated") {
      throw new AppError(400, "INVALID_STATE", "AFE must be in validated status to approve");
    }
    if (afe.createdByUserId === user.id) {
      throw new AppError(409, "MAKER_CHECKER_VIOLATION", "Actor cannot approve own submission.");
    }
    const approved = await prisma.afes.update({
      where: { id },
      data: { status: "approved", silvaApproved: true, approvalDate: new Date() },
    });
    return afeJson(approved);
  }

  if (!isSPX) throw new AppError(403, "FORBIDDEN", "Only SPX can approve Band A/B AFEs");
  if (!["validated", "submitted"].includes(afe.status)) {
    throw new AppError(400, "INVALID_STATE", "AFE must be validated to approve");
  }
  const approved = await prisma.afes.update({
    where: { id },
    data: { status: "approved", approvalDate: new Date() },
  });
  return afeJson(approved);
};

exports.reject = async (id, reason, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }) });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (afe.status === "rejected") return afeJson(afe);
  const issuedWo = await prisma.work_orders.findFirst({ where: { afeId: id, status: { not: "draft" } } });
  if (issuedWo) throw new AppError(400, "INVALID_STATE", "Cannot reject an AFE with issued work orders.");
  if (!["submitted", "validated", "approved"].includes(afe.status)) {
    throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  }
  if (afe.band === "C" || afe.band === "D") {
    if (!["silva_owner", "silva_country_manager"].includes(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
    }
  } else if (!isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const updated = await prisma.afes.update({ where: { id }, data: { status: "rejected" } });
  return afeJson(updated);
};

exports.close = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }) });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (afe.status === "closed") return afeJson(afe);
  if (!["approved", "active"].includes(afe.status)) {
    throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  }
  const updated = await prisma.afes.update({ where: { id }, data: { status: "closed" } });
  return afeJson(updated);
};

exports.getHistory = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }) });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  const rows = await prisma.audit_log.findMany({
    where: { entityType: "afe", entityId: id },
    orderBy: { timestamp: "desc" },
  });
  return rows.map(auditJson);
};

exports.listIntakeVendorAfes = async (query, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions.");
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = scopedWhere(user, { planningMode: "ad_hoc", origin: "vendor_request", status: "draft" });
  const [rows, total] = await Promise.all([
    prisma.afes.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.afes.count({ where }),
  ]);
  return { items: rows.map(afeJson), meta: meta(page, pageSize, total) };
};
