const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const computeBand = require("./utils/computeBand");
const { nextTextId, nextAfpId } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { afeJson, auditJson } = require("../utils/serializers");
const { isVendorRole, isSpxRole } = require("../utils/roles");
const notify = require("./workflowNotifications.service");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const budgetService = require("./cropfort/budget.service");

const afeInclude = {
  afpBlockLine: {
    include: {
      block: { select: { id: true, code: true, label: true } },
      activity: { select: { id: true, code: true, name: true, template: { select: { category: true } } } },
    },
  },
};

function mapDiscipline(category) {
  if (!category) return "Agronomy";
  const c = String(category).toLowerCase();
  if (c.includes("process")) return "Processing";
  if (c.includes("infra")) return "Infrastructure";
  if (c.includes("environ")) return "Environment";
  if (c.includes("social")) return "Social";
  if (c.includes("admin")) return "General Admin";
  return "Agronomy";
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

exports.findAll = async (query, user) => {
  if (isVendorRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Vendors cannot access AFE register");
  }
  const { page, pageSize, skip, take, statuses } = parseListQuery(query);
  const where = scopedWhere(user);
  if (statuses.length) where.status = { in: statuses };
  if (query.band) where.band = query.band;
  if (query.afpLineId) where.afpLineId = query.afpLineId;
  if (query.afpBlockLineId) where.afpBlockLineId = query.afpBlockLineId;
  if (query.silvaApprovalRequired === "true") where.silvaApprovalRequired = true;
  if (query.silvaApprovalRequired === "false") where.silvaApprovalRequired = false;
  const [rows, total] = await Promise.all([
    prisma.afes.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: afeInclude }),
    prisma.afes.count({ where }),
  ]);
  return { items: rows.map(afeJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }), include: afeInclude });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (isVendorRole(user.role) && afe.createdByUserId !== user.id) {
    throw new AppError(404, "NOT_FOUND", "AFE not found");
  }
  return afeJson(afe);
};

exports.create = async (dto, user) => {
  const programId = requireProgramId(user);
  const id = await nextTextId("afe", "AFE");

  let afpLineId = dto.afpLineId || null;
  let afpBlockLineId = dto.afpBlockLineId || null;
  let operatingDiscipline = dto.operatingDiscipline;
  let description = dto.description;
  let estimatedCostEtb = Number(dto.estimatedCostEtb) || 0;

  if (afpBlockLineId) {
    const blockLine = await prisma.afp_block_lines.findFirst({
      where: { id: afpBlockLineId, programId, status: "approved" },
      include: {
        block: { select: { id: true, code: true, label: true, farmEstateId: true } },
        activity: {
          include: { template: { select: { category: true } } },
        },
      },
    });
    if (!blockLine) {
      throw new AppError(404, "NOT_FOUND", "Approved annual plan line not found.");
    }
    if (blockLine.electionStatus !== "elected") {
      throw new AppError(
        422,
        "BUSINESS_RULE_VIOLATION",
        "Elect this annual plan line before creating a commitment (Rate card → Annual plan → Commitments).",
      );
    }

    const { costs } = await budgetService.costForAfpBlockLine(blockLine, programId);
    if (!(estimatedCostEtb > 0)) {
      estimatedCostEtb = costs.totalCostEtb;
    }
    if (!(estimatedCostEtb > 0)) {
      const hint = costs.warnings?.length ? ` ${costs.warnings.join(" ")}` : "";
      throw new AppError(
        422,
        "BUSINESS_RULE_VIOLATION",
        `No Rate card–derived cost for this line. Approve Rate card rates and activity norms/qty.${hint}`,
      );
    }

    const blockLabel = blockLine.block?.label || blockLine.block?.code || blockLine.blockId;
    const activityLabel = blockLine.activity
      ? `${blockLine.activity.code} — ${blockLine.activity.name}`
      : blockLine.activityId;

    if (!operatingDiscipline?.trim()) {
      operatingDiscipline = mapDiscipline(blockLine.activity?.template?.category);
    }
    if (!description?.trim()) {
      description = `${blockLabel}: ${activityLabel} (${blockLine.planYear})`;
    }

    const bridgeId = await nextAfpId(blockLine.planYear);
    await prisma.afp_lines.create({
      data: programCreateData(user, {
        id: bridgeId,
        year: blockLine.planYear,
        operatingDiscipline,
        activity: description,
        budgetAllocatedUsd: decimal(estimatedCostEtb),
        budgetAllocatedEtb: decimal(estimatedCostEtb),
        kpiTarget: `Block AFP ${blockLine.id}`,
        notes: `Auto envelope for annual plan line ${blockLine.id}`,
        status: "approved",
        silvaApproved: true,
        approvalDate: new Date(),
        createdByUserId: user.id,
      }),
    });
    afpLineId = bridgeId;
  } else if (afpLineId) {
    const afp = await prisma.afp_lines.findFirst({ where: { id: afpLineId, programId } });
    if (!afp) throw new AppError(404, "NOT_FOUND", "AFP line not found.");
    if (!(estimatedCostEtb > 0)) {
      throw new AppError(400, "VALIDATION_ERROR", "Estimated cost must be positive.");
    }
  } else {
    throw new AppError(400, "VALIDATION_ERROR", "Select an annual plan line.");
  }

  const thresholds = await getThresholds(programId);
  const band = computeBand(estimatedCostEtb, thresholds);
  const silvaApprovalRequired = band === "C" || band === "D";

  const afe = await prisma.afes.create({
    data: programCreateData(user, {
      id,
      afpLineId,
      afpBlockLineId,
      operatingDiscipline,
      description,
      estimatedCostUsd: decimal(estimatedCostEtb),
      band,
      silvaApprovalRequired,
      createdByUserId: user.id,
    }),
    include: afeInclude,
  });
  return afeJson(afe);
};

exports.update = async (id, dto, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }) });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (afe.status !== "draft") throw new AppError(400, "INVALID_STATE", "Only draft records can be edited.");
  if (isVendorRole(user.role) && afe.createdByUserId !== user.id) {
    throw new AppError(404, "NOT_FOUND", "AFE not found");
  }
  const cost = dto.estimatedCostEtb !== undefined ? dto.estimatedCostEtb : Number(afe.estimatedCostUsd);
  const thresholds = await getThresholds(requireProgramId(user));
  const band = computeBand(cost, thresholds);
  const updated = await prisma.afes.update({
    where: { id },
    data: {
      operatingDiscipline: dto.operatingDiscipline ?? afe.operatingDiscipline,
      description: dto.description ?? afe.description,
      estimatedCostUsd: decimal(cost),
      band,
      silvaApprovalRequired: band === "C" || band === "D",
    },
    include: afeInclude,
  });
  return afeJson(updated);
};

exports.submit = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }), include: afeInclude });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (afe.status === "submitted") return afeJson(afe);
  if (afe.status !== "draft") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  const updated = await prisma.afes.update({ where: { id }, data: { status: "submitted" }, include: afeInclude });
  await notify.afeSubmitted(updated);
  return afeJson(updated);
};

exports.validate = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }), include: afeInclude });
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
    include: afeInclude,
  });
  if (afe.band === "B") {
    await notify.afePendingSilva(
      afe,
      `${id} Band B issued by SPX — Silva may object within 5 business days (silence is deemed approval).`,
    );
  } else if (afe.silvaApprovalRequired) {
    await notify.afePendingSilva(
      afe,
      `${id} (${afe.band}) requires Silva written approval before the AFE issues.`,
    );
  }
  return afeJson(updated);
};

exports.approve = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }), include: afeInclude });
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
      include: afeInclude,
    });
    await notify.afeApproved(approved);
    return afeJson(approved);
  }

  if (!isSPX) throw new AppError(403, "FORBIDDEN", "Only SPX can approve Band A/B AFEs");
  if (!["validated", "submitted"].includes(afe.status)) {
    throw new AppError(400, "INVALID_STATE", "AFE must be validated to approve");
  }
  const approved = await prisma.afes.update({
    where: { id },
    data: { status: "approved", approvalDate: new Date() },
    include: afeInclude,
  });
  await notify.afeApproved(approved);
  return afeJson(approved);
};

exports.reject = async (id, reason, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }), include: afeInclude });
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
  const updated = await prisma.afes.update({ where: { id }, data: { status: "rejected" }, include: afeInclude });
  await notify.afeRejected(updated);
  return afeJson(updated);
};

exports.close = async (id, user) => {
  const afe = await prisma.afes.findFirst({ where: scopedWhere(user, { id }), include: afeInclude });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (afe.status === "closed") return afeJson(afe);
  if (!["approved", "active"].includes(afe.status)) {
    throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  }
  const updated = await prisma.afes.update({ where: { id }, data: { status: "closed" }, include: afeInclude });
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
