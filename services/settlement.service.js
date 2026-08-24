const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { nextTextId } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { settlementJson } = require("../utils/serializers");
const { isVendorRole } = require("../utils/roles");
const { assertMakerChecker } = require("./utils/makerChecker");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const notify = require("./workflowNotifications.service");

exports.findAll = async (query, user) => {
  const { page, pageSize, skip, take, statuses } = parseListQuery(query);
  const where = scopedWhere(user);
  if (isVendorRole(user.role)) {
    const vendor = await prisma.vendors.findUnique({ where: { id: user.vendorId || "" } });
    if (vendor) where.payee = vendor.name;
  }
  if (statuses.length) where.status = { in: statuses };
  if (query.workOrderId) where.workOrderId = query.workOrderId;
  if (query.type) where.type = query.type;
  const [rows, total] = await Promise.all([
    prisma.owner_settlements.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.owner_settlements.count({ where }),
  ]);
  return { items: rows.map(settlementJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  const row = await prisma.owner_settlements.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Settlement not found.");
  return settlementJson(row);
};

exports.create = async (dto, user) => {
  const programId = requireProgramId(user);
  const pr = await prisma.payment_requests.findFirst({ where: { id: dto.paymentRequestId, programId } });
  if (!pr) throw new AppError(404, "NOT_FOUND", "Payment request not found.");
  if (pr.status !== "verified") {
    throw new AppError(422, "BUSINESS_RULE_VIOLATION", "Payment request must be verified before settlement.");
  }
  const id = await nextTextId("stl", "STL");
  const row = await prisma.owner_settlements.create({
    data: programCreateData(user, {
      id,
      workOrderId: dto.workOrderId,
      paymentRequestId: dto.paymentRequestId,
      type: dto.type,
      payee: dto.payee,
      amountEtb: decimal(dto.amountEtb),
    }),
  });
  await notify.settlementCreated(row);
  return settlementJson(row);
};

exports.update = async (id, dto, user) => {
  const row = await prisma.owner_settlements.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Settlement not found.");
  if (row.status !== "draft") throw new AppError(400, "INVALID_STATE", "Only draft records can be edited.");
  const updated = await prisma.owner_settlements.update({
    where: { id },
    data: {
      payee: dto.payee ?? row.payee,
      amountEtb: dto.amountEtb !== undefined ? decimal(dto.amountEtb) : undefined,
      type: dto.type ?? row.type,
    },
  });
  return settlementJson(updated);
};

exports.authorize = async (id, user) => {
  const row = await prisma.owner_settlements.findUnique({
    where: { id },
    include: { paymentRequest: true },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Settlement not found.");
  if (row.status === "authorized") return settlementJson(row);
  if (row.status !== "draft") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  if (user.organizationType !== "spx") {
    throw new AppError(403, "FORBIDDEN", "Only SPX can authorize settlements.");
  }
  await assertMakerChecker({
    actor: user,
    submitterUserId: row.paymentRequest?.requestedByUserId,
    prisma,
    actionLabel: "authorize",
  });
  const updated = await prisma.owner_settlements.update({
    where: { id },
    data: {
      status: "authorized",
      spxAuthorized: true,
      authorizedByUserId: user.id,
      dateAuthorized: new Date(),
    },
  });
  await notify.settlementAuthorized(updated);
  return settlementJson(updated);
};

exports.markSettled = async (id, user) => {
  const row = await prisma.owner_settlements.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Settlement not found.");
  if (row.status === "settled") return settlementJson(row);
  if (row.status !== "authorized") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  const updated = await prisma.owner_settlements.update({ where: { id }, data: { status: "settled" } });
  await prisma.payment_requests.update({
    where: { id: row.paymentRequestId },
    data: { status: "settled", settlementId: row.id },
  });
  await notify.settlementSettled(updated);
  const settledPr = await prisma.payment_requests.findUnique({ where: { id: row.paymentRequestId } });
  if (settledPr) await notify.paymentRequestSettled(settledPr);
  return settlementJson(updated);
};
