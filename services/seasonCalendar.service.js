const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { parseListQuery, meta } = require("../utils/helpers");
const { isSpxRole, isVendorRole, isSilvaRole } = require("../utils/roles");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");

function calendarJson(row, includeWindows = false) {
  const base = {
    id: row.id,
    programId: row.programId,
    year: row.year,
    name: row.name,
    status: row.status,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (includeWindows && row.windows) {
    base.windows = row.windows.map(windowJson);
  }
  return base;
}

function windowJson(row) {
  return {
    id: row.id,
    calendarId: row.calendarId,
    programId: row.programId,
    operatingDiscipline: row.operatingDiscipline,
    activity: row.activity,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    status: row.status,
    linkedWorkOrderId: row.linkedWorkOrderId,
    notes: row.notes,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertCanRead(user) {
  requireProgramId(user);
  // Silva may view issued calendars (high-level plan) but not raw field forms.
}

exports.findAllCalendars = async (query, user) => {
  assertCanRead(user);
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = scopedWhere(user);
  if (query.year) where.year = Number(query.year);
  if (query.status) where.status = query.status;
  if (isSilvaRole(user.role)) {
    where.status = { in: ["active", "archived"] };
  }
  const [rows, total] = await Promise.all([
    prisma.season_calendars.findMany({
      where,
      skip,
      take,
      orderBy: [{ year: "desc" }, { name: "asc" }],
      include: { windows: { orderBy: { weekStart: "asc" } } },
    }),
    prisma.season_calendars.count({ where }),
  ]);
  return { items: rows.map((r) => calendarJson(r, true)), meta: meta(page, pageSize, total) };
};

exports.findCalendar = async (id, user) => {
  assertCanRead(user);
  const where = scopedWhere(user, { id });
  if (isSilvaRole(user.role)) where.status = { in: ["active", "archived"] };
  const row = await prisma.season_calendars.findFirst({
    where,
    include: { windows: { orderBy: { weekStart: "asc" } } },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Season calendar not found.");
  return calendarJson(row, true);
};

exports.createCalendar = async (dto, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Only SPX can create season calendars.");
  const row = await prisma.season_calendars.create({
    data: programCreateData(user, {
      id: uuid("cal"),
      year: Number(dto.year),
      name: dto.name,
      notes: dto.notes || null,
      status: "draft",
      createdByUserId: user.id,
    }),
  });
  return calendarJson(row);
};

exports.updateCalendar = async (id, dto, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Only SPX can update season calendars.");
  const existing = await prisma.season_calendars.findFirst({ where: scopedWhere(user, { id }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Season calendar not found.");
  const row = await prisma.season_calendars.update({
    where: { id },
    data: {
      name: dto.name ?? existing.name,
      notes: dto.notes === undefined ? undefined : dto.notes,
      status: dto.status ?? existing.status,
    },
  });
  return calendarJson(row);
};

exports.addWindow = async (calendarId, dto, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Only SPX can add season windows.");
  const calendar = await prisma.season_calendars.findFirst({ where: scopedWhere(user, { id: calendarId }) });
  if (!calendar) throw new AppError(404, "NOT_FOUND", "Season calendar not found.");
  const weekStart = Number(dto.weekStart);
  const weekEnd = Number(dto.weekEnd);
  if (weekStart < 1 || weekEnd > 52 || weekStart > weekEnd) {
    throw new AppError(400, "VALIDATION_ERROR", "weekStart/weekEnd must be 1–52 and start ≤ end.");
  }
  if (dto.linkedWorkOrderId) {
    const wo = await prisma.work_orders.findFirst({ where: scopedWhere(user, { id: dto.linkedWorkOrderId }) });
    if (!wo) throw new AppError(404, "NOT_FOUND", "Work order not found.");
  }
  const row = await prisma.season_windows.create({
    data: {
      id: uuid("cwin"),
      calendarId,
      programId: calendar.programId,
      operatingDiscipline: dto.operatingDiscipline,
      activity: dto.activity,
      weekStart,
      weekEnd,
      linkedWorkOrderId: dto.linkedWorkOrderId || null,
      notes: dto.notes || null,
      status: "planned",
    },
  });
  return windowJson(row);
};

exports.updateWindow = async (windowId, dto, user) => {
  const existing = await prisma.season_windows.findFirst({ where: scopedWhere(user, { id: windowId }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Season window not found.");

  if (dto.status) {
    return transitionWindow(existing, dto.status, user, dto);
  }
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Only SPX can edit window details.");
  if (!["planned", "issued"].includes(existing.status)) {
    throw new AppError(400, "INVALID_STATE", "Only planned/issued windows can be edited.");
  }
  const row = await prisma.season_windows.update({
    where: { id: windowId },
    data: {
      operatingDiscipline: dto.operatingDiscipline ?? existing.operatingDiscipline,
      activity: dto.activity ?? existing.activity,
      weekStart: dto.weekStart !== undefined ? Number(dto.weekStart) : undefined,
      weekEnd: dto.weekEnd !== undefined ? Number(dto.weekEnd) : undefined,
      linkedWorkOrderId: dto.linkedWorkOrderId === undefined ? undefined : dto.linkedWorkOrderId || null,
      notes: dto.notes === undefined ? undefined : dto.notes,
    },
  });
  return windowJson(row);
};

async function transitionWindow(existing, status, user, dto = {}) {
  const id = existing.id;
  if (status === "issued") {
    if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Only SPX can issue windows.");
    if (existing.status !== "planned") throw new AppError(400, "INVALID_STATE", "Only planned windows can be issued.");
    const row = await prisma.season_windows.update({
      where: { id },
      data: { status: "issued", issuedAt: new Date() },
    });
    await prisma.season_calendars.update({
      where: { id: existing.calendarId },
      data: { status: "active" },
    });
    return windowJson(row);
  }
  if (status === "in_progress") {
    if (!isSpxRole(user.role) && !isVendorRole(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
    }
    if (!["issued", "in_progress"].includes(existing.status)) {
      throw new AppError(400, "INVALID_STATE", "Window must be issued before starting.");
    }
    const row = await prisma.season_windows.update({ where: { id }, data: { status: "in_progress" } });
    return windowJson(row);
  }
  if (status === "complete") {
    if (!isSpxRole(user.role) && !isVendorRole(user.role)) {
      throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
    }
    if (!["issued", "in_progress"].includes(existing.status)) {
      throw new AppError(400, "INVALID_STATE", "Window must be active to complete.");
    }
    const row = await prisma.season_windows.update({
      where: { id },
      data: { status: "complete", completedAt: new Date(), notes: dto.notes ?? existing.notes },
    });
    return windowJson(row);
  }
  if (status === "cancelled") {
    if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Only SPX can cancel windows.");
    const row = await prisma.season_windows.update({ where: { id }, data: { status: "cancelled" } });
    return windowJson(row);
  }
  throw new AppError(400, "VALIDATION_ERROR", "Unsupported window status.");
}

exports.issueWindow = async (windowId, user) => {
  const existing = await prisma.season_windows.findFirst({ where: scopedWhere(user, { id: windowId }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Season window not found.");
  return transitionWindow(existing, "issued", user);
};

exports.startWindow = async (windowId, user) => {
  const existing = await prisma.season_windows.findFirst({ where: scopedWhere(user, { id: windowId }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Season window not found.");
  return transitionWindow(existing, "in_progress", user);
};

exports.completeWindow = async (windowId, dto, user) => {
  const existing = await prisma.season_windows.findFirst({ where: scopedWhere(user, { id: windowId }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Season window not found.");
  return transitionWindow(existing, "complete", user, dto || {});
};
