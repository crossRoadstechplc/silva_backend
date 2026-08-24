const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { nextTextId } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { paymentRequestJson, auditJson } = require("../utils/serializers");
const { isVendorRole, isSilvaRole } = require("../utils/roles");
const { assertMakerChecker } = require("./utils/makerChecker");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const notify = require("./workflowNotifications.service");

exports.findAll = async (query, user) => {
  if (isSilvaRole(user.role)) {
    throw new AppError(
      403,
      "FIREWALL_VIOLATION",
      "Silva cannot access raw payment requests; use settlements and dashboard summaries.",
    );
  }
  const { page, pageSize, skip, take, statuses } = parseListQuery(query);
  const where = scopedWhere(user);
  if (isVendorRole(user.role)) where.requestedByUserId = user.id;
  if (statuses.length) where.status = { in: statuses };
  if (query.workOrderId) where.workOrderId = query.workOrderId;
  if (query.type) where.type = query.type;
  const [rows, total] = await Promise.all([
    prisma.payment_requests.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.payment_requests.count({ where }),
  ]);
  return { items: rows.map(paymentRequestJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  if (isSilvaRole(user.role)) {
    throw new AppError(
      403,
      "FIREWALL_VIOLATION",
      "Silva cannot access raw payment requests; use settlements and dashboard summaries.",
    );
  }
  const row = await prisma.payment_requests.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Payment request not found.");
  if (isVendorRole(user.role) && row.requestedByUserId !== user.id) {
    throw new AppError(404, "NOT_FOUND", "Payment request not found.");
  }
  return paymentRequestJson(row);
};

exports.create = async (dto, user) => {
  if (!isVendorRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only vendor roles can create payment requests.");
  }
  const programId = requireProgramId(user);
  const ticket = await prisma.field_tickets.findFirst({ where: { id: dto.fieldTicketId, programId } });
  if (!ticket) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  if (!ticket.signedOff || ticket.status !== "validated") {
    throw new AppError(422, "BUSINESS_RULE_VIOLATION", "Payment Request requires a signed-off Field Ticket.");
  }
  const id = await nextTextId("pr", "PR");
  const row = await prisma.payment_requests.create({
    data: programCreateData(user, {
      id,
      workOrderId: dto.workOrderId,
      fieldTicketId: dto.fieldTicketId,
      requestedByUserId: user.id,
      type: dto.type,
      amountRequestedEtb: decimal(dto.amountRequestedEtb),
    }),
  });
  await prisma.field_tickets.update({ where: { id: ticket.id }, data: { paymentRequestId: row.id } });
  return paymentRequestJson(row);
};

exports.update = async (id, dto, user) => {
  const row = await prisma.payment_requests.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Payment request not found.");
  if (row.status !== "draft") throw new AppError(400, "INVALID_STATE", "Only draft records can be edited.");
  const updated = await prisma.payment_requests.update({
    where: { id },
    data: {
      type: dto.type ?? row.type,
      amountRequestedEtb: dto.amountRequestedEtb !== undefined ? decimal(dto.amountRequestedEtb) : undefined,
    },
  });
  return paymentRequestJson(updated);
};

exports.submit = async (id, user) => {
  const row = await prisma.payment_requests.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Payment request not found.");
  if (row.status === "submitted") return paymentRequestJson(row);
  if (row.status !== "draft") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  const updated = await prisma.payment_requests.update({
    where: { id },
    data: { status: "submitted", dateSubmitted: new Date() },
  });
  await notify.paymentRequestSubmitted(updated);
  return paymentRequestJson(updated);
};

exports.verify = async (id, user) => {
  const row = await prisma.payment_requests.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Payment request not found.");
  if (row.status === "verified") return paymentRequestJson(row);
  if (row.status !== "submitted") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  if (user.organizationType !== "spx") {
    throw new AppError(403, "FORBIDDEN", "Only SPX can verify payment requests.");
  }
  await assertMakerChecker({
    actor: user,
    submitterUserId: row.requestedByUserId,
    prisma,
    actionLabel: "verify",
  });
  const updated = await prisma.payment_requests.update({
    where: { id },
    data: {
      status: "verified",
      spxVerified: true,
      spxVerifiedByUserId: user.id,
      verifiedDate: new Date(),
    },
  });
  await notify.paymentRequestVerified(updated);
  return paymentRequestJson(updated);
};

exports.reject = async (id, reason, user) => {
  const row = await prisma.payment_requests.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Payment request not found.");
  if (row.status === "rejected") return paymentRequestJson(row);
  if (row.status !== "submitted") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  const updated = await prisma.payment_requests.update({ where: { id }, data: { status: "rejected" } });
  await notify.paymentRequestRejected(updated);
  return paymentRequestJson(updated);
};

exports.settle = async (id, settlementId, user) => {
  const row = await prisma.payment_requests.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Payment request not found.");
  if (row.status === "settled") return paymentRequestJson(row);
  if (row.status !== "verified") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  const updated = await prisma.payment_requests.update({
    where: { id },
    data: { status: "settled", settlementId: settlementId || row.settlementId },
  });
  await notify.paymentRequestSettled(updated);
  return paymentRequestJson(updated);
};

exports.getHistory = async (id) => {
  const row = await prisma.payment_requests.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Payment request not found.");
  const logs = await prisma.audit_log.findMany({
    where: { entityType: "payment_request", entityId: id },
    orderBy: { timestamp: "desc" },
  });
  return logs.map(auditJson);
};
