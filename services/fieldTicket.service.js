const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { fieldTicketJson, auditJson } = require("../utils/serializers");
const { isSilvaRole, isVendorRole } = require("../utils/roles");
const { assertMakerChecker } = require("./utils/makerChecker");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const farmEstateScope = require("./utils/farmEstateScope");
const normValidation = require("./normValidation.service");
const notify = require("./workflowNotifications.service");

exports.findAll = async (query, user) => {
  if (isSilvaRole(user.role)) {
    throw new AppError(403, "FIREWALL_VIOLATION", "Silva cannot access raw field tickets.");
  }
  const programId = requireProgramId(user);
  const { page, pageSize, skip, take, statuses } = parseListQuery(query);
  const where = scopedWhere(user);
  let workOrderFilter = {};
  if (isVendorRole(user.role)) {
    workOrderFilter = {
      OR: [{ assignedVendorId: user.vendorId }, { assignedVendorId: null }],
    };
  }
  const farmEstateId = farmEstateScope.parseFarmEstateId(query);
  if (farmEstateId) {
    workOrderFilter = await farmEstateScope.mergeWorkOrderEstateFilter(workOrderFilter, farmEstateId, programId);
  }
  if (Object.keys(workOrderFilter).length) where.workOrder = workOrderFilter;
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
    include: { workOrder: true, activityCatalog: true },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  if (isVendorRole(user.role) && row.workOrder.assignedVendorId && row.workOrder.assignedVendorId !== user.vendorId) {
    throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  }
  return fieldTicketJson(row);
};

async function resolveCatalog(dto, wo) {
  const catalogId = dto.activityCatalogId || wo.activityCatalogId;
  if (!catalogId) return null;
  return prisma.activity_catalog.findFirst({ where: { id: catalogId, programId: wo.programId } });
}

exports.create = async (dto, user) => {
  if (!isVendorRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only vendor field roles can create field tickets.");
  }
  const programId = requireProgramId(user);
  const wo = await prisma.work_orders.findFirst({ where: { id: dto.workOrderId, programId } });
  if (!wo) throw new AppError(404, "NOT_FOUND", "Work order not found.");

  const catalog = await resolveCatalog(dto, wo);
  const ticketType = dto.ticketType || (catalog?.sectionCode === "salary" ? "payroll_confirmation" : "field_execution");
  const validation =
    ticketType === "payroll_confirmation"
      ? normValidation.validatePayrollLine(catalog, dto)
      : normValidation.validateAgainstCatalog(catalog, dto);

  const row = await prisma.field_tickets.create({
    data: programCreateData(user, {
      id: uuid("ft"),
      workOrderId: dto.workOrderId,
      submittedByUserId: user.id,
      activityCatalogId: catalog?.id || dto.activityCatalogId || null,
      ticketType,
      activityRecorded: dto.activityRecorded || catalog?.nameEn || wo.activity,
      areaHa: decimal(dto.areaHa),
      laborCount: dto.laborCount,
      materialsUsed: dto.materialsUsed || "",
      actualQuantity: dto.actualQuantity != null ? decimal(dto.actualQuantity) : null,
      actualMandays: dto.actualMandays != null ? decimal(dto.actualMandays) : null,
      actualCostEtb: dto.actualCostEtb != null ? decimal(dto.actualCostEtb) : null,
      normValidationJson: validation,
      ticketDate: new Date(`${dto.ticketDate}T00:00:00.000Z`),
    }),
  });
  return fieldTicketJson(row);
};

exports.update = async (id, dto, user) => {
  const row = await prisma.field_tickets.findUnique({
    where: { id },
    include: { workOrder: true },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  if (row.status !== "draft") throw new AppError(400, "INVALID_STATE", "Only draft records can be edited.");

  const catalog = dto.activityCatalogId
    ? await prisma.activity_catalog.findFirst({ where: { id: dto.activityCatalogId } })
    : row.activityCatalogId
      ? await prisma.activity_catalog.findFirst({ where: { id: row.activityCatalogId } })
      : null;

  const merged = {
    actualQuantity: dto.actualQuantity ?? (row.actualQuantity != null ? Number(row.actualQuantity) : null),
    actualMandays: dto.actualMandays ?? (row.actualMandays != null ? Number(row.actualMandays) : null),
    actualCostEtb: dto.actualCostEtb ?? (row.actualCostEtb != null ? Number(row.actualCostEtb) : null),
  };
  const validation =
    row.ticketType === "payroll_confirmation"
      ? normValidation.validatePayrollLine(catalog, merged)
      : normValidation.validateAgainstCatalog(catalog, merged);

  const updated = await prisma.field_tickets.update({
    where: { id },
    data: {
      activityCatalogId: dto.activityCatalogId ?? row.activityCatalogId,
      activityRecorded: dto.activityRecorded ?? row.activityRecorded,
      areaHa: dto.areaHa !== undefined ? decimal(dto.areaHa) : undefined,
      laborCount: dto.laborCount ?? row.laborCount,
      materialsUsed: dto.materialsUsed ?? row.materialsUsed,
      actualQuantity: dto.actualQuantity !== undefined ? decimal(dto.actualQuantity) : undefined,
      actualMandays: dto.actualMandays !== undefined ? decimal(dto.actualMandays) : undefined,
      actualCostEtb: dto.actualCostEtb !== undefined ? decimal(dto.actualCostEtb) : undefined,
      normValidationJson: validation,
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

  const validation = row.normValidationJson;
  if (validation?.flags?.some((f) => f.blockPayment)) {
    throw new AppError(422, "NORM_VIOLATION", "Cost variance blocks submission. Adjust actuals or contact SPX.");
  }

  return fieldTicketJson(
    await prisma.field_tickets.update({ where: { id }, data: { status: "submitted" } }).then(async (row) => {
      await notify.fieldTicketSubmitted(row);
      return row;
    }),
  );
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
    await prisma.field_tickets.update({ where: { id }, data: { status: "vendor_reviewed" } }).then(async (row) => {
      await notify.fieldTicketVendorReviewed(row);
      return row;
    }),
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
  const updated = await prisma.field_tickets.update({
    where: { id },
    data: {
      status: "validated",
      signedOff: true,
      signedOffByUserId: user.id,
      signedOffAt: new Date(),
    },
  });
  await notify.fieldTicketValidated(updated);
  return fieldTicketJson(updated);
};

exports.reject = async (id, reason, user) => {
  const row = await prisma.field_tickets.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  if (row.status === "rejected") return fieldTicketJson(row);
  if (!["submitted", "vendor_reviewed"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  }
  const updated = await prisma.field_tickets.update({ where: { id }, data: { status: "rejected" } });
  await notify.fieldTicketRejected(updated);
  return fieldTicketJson(updated);
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
