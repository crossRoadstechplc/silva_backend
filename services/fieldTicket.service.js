const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { fieldTicketJson, auditJson } = require("../utils/serializers");
const { isSilvaRole, isVendorRole } = require("../utils/roles");
const { assertMakerChecker } = require("./utils/makerChecker");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");

exports.findAll = async (query, user) => {
  if (isSilvaRole(user.role)) {
    throw new AppError(403, "FIREWALL_VIOLATION", "Silva cannot access raw field tickets.");
  }
  const { page, pageSize, skip, take, statuses } = parseListQuery(query);
  const where = scopedWhere(user);
  if (isVendorRole(user.role)) {
    where.workOrder = {
      OR: [{ assignedVendorId: user.vendorId }, { assignedVendorId: null }],
    };
  }
  if (statuses.length) where.status = { in: statuses };
  if (query.workOrderId) where.workOrderId = query.workOrderId;
  const [rows, total] = await Promise.all([
    prisma.field_tickets.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.field_tickets.count({ where }),
  ]);
  return { items: rows.map(fieldTicketJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  if (isSilvaRole(user.role)) {
    throw new AppError(403, "FIREWALL_VIOLATION", "Silva cannot access raw field tickets.");
  }
  const row = await prisma.field_tickets.findFirst({
    where: scopedWhere(user, { id }),
    include: { workOrder: true },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  if (isVendorRole(user.role) && row.workOrder.assignedVendorId && row.workOrder.assignedVendorId !== user.vendorId) {
    throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  }
  return fieldTicketJson(row);
};

exports.create = async (dto, user) => {
  if (!isVendorRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only vendor field roles can create field tickets.");
  }
  const programId = requireProgramId(user);
  const wo = await prisma.work_orders.findFirst({ where: { id: dto.workOrderId, programId } });
  if (!wo) throw new AppError(404, "NOT_FOUND", "Work order not found.");
  const row = await prisma.field_tickets.create({
    data: programCreateData(user, {
      id: uuid("ft"),
      workOrderId: dto.workOrderId,
      submittedByUserId: user.id,
      activityRecorded: dto.activityRecorded,
      areaHa: decimal(dto.areaHa),
      laborCount: dto.laborCount,
      materialsUsed: dto.materialsUsed || "",
      ticketDate: new Date(`${dto.ticketDate}T00:00:00.000Z`),
    }),
  });
  return fieldTicketJson(row);
};

exports.update = async (id, dto, user) => {
  const row = await prisma.field_tickets.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  if (row.status !== "draft") throw new AppError(400, "INVALID_STATE", "Only draft records can be edited.");
  const updated = await prisma.field_tickets.update({
    where: { id },
    data: {
      activityRecorded: dto.activityRecorded ?? row.activityRecorded,
      areaHa: dto.areaHa !== undefined ? decimal(dto.areaHa) : undefined,
      laborCount: dto.laborCount ?? row.laborCount,
      materialsUsed: dto.materialsUsed ?? row.materialsUsed,
      ticketDate: dto.ticketDate ? new Date(`${dto.ticketDate}T00:00:00.000Z`) : row.ticketDate,
    },
  });
  return fieldTicketJson(updated);
};

exports.submit = async (id, user) => {
  const row = await prisma.field_tickets.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  if (row.status === "submitted") return fieldTicketJson(row);
  if (row.status !== "draft") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  return fieldTicketJson(await prisma.field_tickets.update({ where: { id }, data: { status: "submitted" } }));
};

exports.vendorReview = async (id, user) => {
  const row = await prisma.field_tickets.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  if (row.status === "vendor_reviewed") return fieldTicketJson(row);
  if (row.status !== "submitted") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  if (row.submittedByUserId === user.id) {
    throw new AppError(409, "MAKER_CHECKER_VIOLATION", "Actor cannot approve own submission.");
  }
  return fieldTicketJson(
    await prisma.field_tickets.update({ where: { id }, data: { status: "vendor_reviewed" } })
  );
};

exports.validate = async (id, user) => {
  const row = await prisma.field_tickets.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  if (row.status === "validated") return fieldTicketJson(row);
  if (row.status !== "vendor_reviewed") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  if (user.organizationType !== "spx") {
    throw new AppError(403, "FORBIDDEN", "Only SPX can validate field tickets.");
  }
  await assertMakerChecker({
    actor: user,
    submitterUserId: row.submittedByUserId,
    prisma,
    actionLabel: "validate",
  });
  return fieldTicketJson(
    await prisma.field_tickets.update({
      where: { id },
      data: {
        status: "validated",
        signedOff: true,
        signedOffByUserId: user.id,
        signedOffAt: new Date(),
      },
    })
  );
};

exports.reject = async (id, reason, user) => {
  const row = await prisma.field_tickets.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  if (row.status === "rejected") return fieldTicketJson(row);
  if (!["submitted", "vendor_reviewed"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  }
  return fieldTicketJson(await prisma.field_tickets.update({ where: { id }, data: { status: "rejected" } }));
};

exports.getHistory = async (id) => {
  const row = await prisma.field_tickets.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  const logs = await prisma.audit_log.findMany({
    where: { entityType: "field_ticket", entityId: id },
    orderBy: { timestamp: "desc" },
  });
  return logs.map(auditJson);
};
