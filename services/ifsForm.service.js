const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { parseListQuery, meta } = require("../utils/helpers");
const { isVendorRole, isSpxRole, isSilvaRole } = require("../utils/roles");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");

/** Practical IFS subset (Option 1) — same system as Coffee Field OS, linked to WO/FT. */
const FORM_CATALOG = [
  {
    formType: "daily_work_log",
    label: "Daily work log",
    description: "Crew activity, hours, and blocks worked for the day.",
    fields: ["crewCount", "hoursWorked", "blocks", "summary"],
  },
  {
    formType: "pruning_completion",
    label: "Pruning completion",
    description: "Block-level pruning / topping completion check.",
    fields: ["blockRef", "treesCompleted", "qualityNotes"],
  },
  {
    formType: "fertilizer_application",
    label: "Fertilizer application",
    description: "Input type, rate, and hectares covered.",
    fields: ["product", "rateKgHa", "areaHa", "weatherOk"],
  },
  {
    formType: "pest_disease_scout",
    label: "Pest / disease scout",
    description: "Field scouting findings and recommended action.",
    fields: ["pestOrDisease", "severity", "actionTaken"],
  },
  {
    formType: "harvest_cherry_intake",
    label: "Harvest cherry intake",
    description: "Cherry volume and grade at intake.",
    fields: ["kgCherry", "grade", "station"],
  },
  {
    formType: "safety_stop_work",
    label: "Safety / stop-work",
    description: "Immediate stop-work or safety incident report.",
    fields: ["severity", "location", "immediateAction"],
  },
  {
    formType: "equipment_downtime",
    label: "Equipment downtime",
    description: "Equipment outage impacting the work order window.",
    fields: ["asset", "hoursDown", "cause"],
  },
  {
    formType: "weather_field_readiness",
    label: "Weather / field readiness",
    description: "Go / no-go readiness for planned field work.",
    fields: ["rainfallMm", "soilCondition", "readyToWork"],
  },
  {
    formType: "labor_attendance",
    label: "Labor attendance",
    description: "Headcount and attendance for the assigned crew.",
    fields: ["plannedHeadcount", "actualHeadcount", "absences"],
  },
  {
    formType: "block_inspection",
    label: "Block inspection",
    description: "SPX or vendor block walk findings.",
    fields: ["blockRef", "condition", "followUp"],
  },
];

function assertNotSilva(user) {
  if (isSilvaRole(user.role)) {
    throw new AppError(403, "FIREWALL_VIOLATION", "IFS field forms are not visible on the Silva desk.");
  }
}

function formJson(row) {
  return {
    id: row.id,
    programId: row.programId,
    formType: row.formType,
    title: row.title,
    workOrderId: row.workOrderId,
    fieldTicketId: row.fieldTicketId,
    blockRef: row.blockRef,
    weekNumber: row.weekNumber,
    payload: row.payload || {},
    status: row.status,
    submittedByUserId: row.submittedByUserId,
    validatedByUserId: row.validatedByUserId,
    rejectionReason: row.rejectionReason,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

exports.catalog = async (user) => {
  assertNotSilva(user);
  requireProgramId(user);
  return FORM_CATALOG;
};

exports.findAll = async (query, user) => {
  assertNotSilva(user);
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = scopedWhere(user);
  if (query.formType) where.formType = query.formType;
  if (query.status) where.status = query.status;
  if (query.workOrderId) where.workOrderId = query.workOrderId;
  if (query.fieldTicketId) where.fieldTicketId = query.fieldTicketId;
  if (isVendorRole(user.role) && user.role !== "vendor_admin") {
    where.submittedByUserId = user.id;
  }
  const [rows, total] = await Promise.all([
    prisma.ifs_forms.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.ifs_forms.count({ where }),
  ]);
  return { items: rows.map(formJson), meta: meta(page, pageSize, total) };
};

exports.findById = async (id, user) => {
  assertNotSilva(user);
  const row = await prisma.ifs_forms.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "IFS form not found.");
  if (isVendorRole(user.role) && user.role !== "vendor_admin" && row.submittedByUserId !== user.id) {
    throw new AppError(404, "NOT_FOUND", "IFS form not found.");
  }
  return formJson(row);
};

exports.create = async (dto, user) => {
  assertNotSilva(user);
  if (!isVendorRole(user.role) && !isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const catalog = FORM_CATALOG.find((f) => f.formType === dto.formType);
  if (!catalog) throw new AppError(400, "VALIDATION_ERROR", "Unknown IFS form type.");
  if (dto.workOrderId) {
    const wo = await prisma.work_orders.findFirst({ where: scopedWhere(user, { id: dto.workOrderId }) });
    if (!wo) throw new AppError(404, "NOT_FOUND", "Work order not found.");
  }
  if (dto.fieldTicketId) {
    const ft = await prisma.field_tickets.findFirst({ where: scopedWhere(user, { id: dto.fieldTicketId }) });
    if (!ft) throw new AppError(404, "NOT_FOUND", "Field ticket not found.");
  }
  const row = await prisma.ifs_forms.create({
    data: programCreateData(user, {
      id: uuid("ifs"),
      formType: dto.formType,
      title: dto.title || catalog.label,
      workOrderId: dto.workOrderId || null,
      fieldTicketId: dto.fieldTicketId || null,
      blockRef: dto.blockRef || null,
      weekNumber: dto.weekNumber ?? null,
      payload: dto.payload || {},
      notes: dto.notes || null,
      submittedByUserId: user.id,
      status: "draft",
    }),
  });
  return formJson(row);
};

exports.update = async (id, dto, user) => {
  assertNotSilva(user);
  const existing = await prisma.ifs_forms.findFirst({ where: scopedWhere(user, { id }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "IFS form not found.");
  if (existing.status !== "draft") throw new AppError(400, "INVALID_STATE", "Only draft forms can be edited.");
  if (isVendorRole(user.role) && existing.submittedByUserId !== user.id && user.role !== "vendor_admin") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const row = await prisma.ifs_forms.update({
    where: { id },
    data: {
      title: dto.title ?? existing.title,
      workOrderId: dto.workOrderId === undefined ? undefined : dto.workOrderId || null,
      fieldTicketId: dto.fieldTicketId === undefined ? undefined : dto.fieldTicketId || null,
      blockRef: dto.blockRef === undefined ? undefined : dto.blockRef || null,
      weekNumber: dto.weekNumber === undefined ? undefined : dto.weekNumber,
      payload: dto.payload ?? existing.payload,
      notes: dto.notes === undefined ? undefined : dto.notes,
    },
  });
  return formJson(row);
};

exports.submit = async (id, user) => {
  assertNotSilva(user);
  const existing = await prisma.ifs_forms.findFirst({ where: scopedWhere(user, { id }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "IFS form not found.");
  if (existing.status !== "draft") throw new AppError(400, "INVALID_STATE", "Only draft forms can be submitted.");
  if (isVendorRole(user.role) && existing.submittedByUserId !== user.id && user.role !== "vendor_admin") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const row = await prisma.ifs_forms.update({ where: { id }, data: { status: "submitted" } });
  return formJson(row);
};

exports.validate = async (id, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Only SPX can validate IFS forms.");
  const existing = await prisma.ifs_forms.findFirst({ where: scopedWhere(user, { id }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "IFS form not found.");
  if (existing.status !== "submitted") throw new AppError(400, "INVALID_STATE", "Form must be submitted first.");
  const row = await prisma.ifs_forms.update({
    where: { id },
    data: { status: "validated", validatedByUserId: user.id, rejectionReason: null },
  });
  return formJson(row);
};

exports.reject = async (id, reason, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Only SPX can reject IFS forms.");
  const existing = await prisma.ifs_forms.findFirst({ where: scopedWhere(user, { id }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "IFS form not found.");
  if (!["submitted", "draft"].includes(existing.status)) {
    throw new AppError(400, "INVALID_STATE", "Form cannot be rejected in this state.");
  }
  const row = await prisma.ifs_forms.update({
    where: { id },
    data: { status: "rejected", validatedByUserId: user.id, rejectionReason: reason },
  });
  return formJson(row);
};
