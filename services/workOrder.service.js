const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid, nextTextId } = require("../utils/ids");
const { parseListQuery, meta } = require("../utils/helpers");
const { workOrderJson, assignmentJson, taskJson } = require("../utils/serializers");
const { isVendorRole, isSpxRole } = require("../utils/roles");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const farmEstateScope = require("./utils/farmEstateScope");
const notify = require("./workflowNotifications.service");

async function defaultVendor() {
  return prisma.vendors.findFirst({ where: { isDefaultExecutionPartner: true } });
}

async function resolveVendorName(wo) {
  if (wo.assignedVendor) return wo.assignedVendor.name;
  const def = await defaultVendor();
  return def ? def.name : null;
}

async function scopedWhereWo(user, extra = {}) {
  const where = scopedWhere(user, extra);
  if (isVendorRole(user.role)) {
    const def = await defaultVendor();
    const vendorId = user.vendorId;
    where.OR = [{ assignedVendorId: vendorId }, ...(def && def.id === vendorId ? [{ assignedVendorId: null }] : [])];
  }
  return where;
}

exports.findAll = async (query, user) => {
  const programId = requireProgramId(user);
  const { page, pageSize, skip, take, statuses } = parseListQuery(query);
  const where = await scopedWhereWo(user);
  if (statuses.length) where.status = { in: statuses };
  if (query.afeId) where.afeId = query.afeId;
  if (query.assignedVendorId) where.assignedVendorId = query.assignedVendorId;
  if (query.tier) where.tier = query.tier;
  const farmEstateId = farmEstateScope.parseFarmEstateId(query);
  if (farmEstateId) {
    const estateFilter = await farmEstateScope.workOrderWhereForEstate(farmEstateId, programId);
    farmEstateScope.mergeEstateFilter(where, estateFilter);
  }
  const [rows, total] = await Promise.all([
    prisma.work_orders.findMany({
      where,
      include: { assignedVendor: true },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.work_orders.count({ where }),
  ]);
  const items = [];
  for (const row of rows) {
    items.push(workOrderJson(row, { assignedVendorName: await resolveVendorName(row) }));
  }
  return { items, meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  const wo = await prisma.work_orders.findFirst({
    where: await scopedWhereWo(user, { id }),
    include: { assignedVendor: true, assignments: true, tasks: true, fieldTickets: true },
  });
  if (!wo) throw new AppError(404, "NOT_FOUND", "Work order not found.");
  return workOrderJson(wo, {
    assignedVendorName: await resolveVendorName(wo),
    assignmentCount: wo.assignments.filter((a) => a.active).length,
    openTaskCount: wo.tasks.filter((t) => t.status === "open" || t.status === "in_progress").length,
    fieldTicketCount: wo.fieldTickets.length,
  });
};

exports.create = async (dto, user) => {
  const programId = requireProgramId(user);
  const afe = await prisma.afes.findFirst({ where: { id: dto.afeId, programId } });
  if (!afe) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (!["approved", "active"].includes(afe.status)) {
    throw new AppError(422, "BUSINESS_RULE_VIOLATION", "Work Order must trace to an approved AFE.");
  }
  const id = await nextTextId("wo", "WO");
  let activity = dto.activity;
  let category = dto.category;
  let activityCatalogId = dto.activityCatalogId ?? null;

  if (activityCatalogId) {
    const catalog = await prisma.activity_catalog.findFirst({
      where: { id: activityCatalogId, programId },
    });
    if (!catalog) throw new AppError(404, "NOT_FOUND", "Activity catalog entry not found.");
    activity = activity || `${catalog.nameEn} (${catalog.id})`;
    category = category || catalog.sectionLabel;
  }

  const wo = await prisma.work_orders.create({
    data: programCreateData(user, {
      id,
      afeId: dto.afeId,
      category,
      activity,
      tier: dto.tier,
      weekStart: dto.weekStart,
      weekEnd: dto.weekEnd,
      spxOversightHoursL1: dto.spxOversightHoursL1 || 0,
      spxOversightHoursL2: dto.spxOversightHoursL2 || 0,
      spxOversightHoursL3: dto.spxOversightHoursL3 || 0,
      assignedVendorId: dto.assignedVendorId ?? null,
      activityCatalogId,
    }),
    include: { assignedVendor: true },
  });

  if (dto.blockIds?.length) {
    for (const blockId of dto.blockIds) {
      await prisma.work_order_block_assignments.create({
        data: {
          id: uuid("wob"),
          workOrderId: wo.id,
          blockId,
          roleOnBlock: "scope",
        },
      });
    }
  }

  return workOrderJson(wo, { assignedVendorName: await resolveVendorName(wo) });
};

exports.update = async (id, dto, user) => {
  const wo = await prisma.work_orders.findUnique({ where: { id } });
  if (!wo) throw new AppError(404, "NOT_FOUND", "Work order not found.");
  if (wo.status !== "draft") throw new AppError(400, "INVALID_STATE", "Only draft records can be edited.");
  const updated = await prisma.work_orders.update({
    where: { id },
    data: {
      category: dto.category ?? wo.category,
      activity: dto.activity ?? wo.activity,
      tier: dto.tier ?? wo.tier,
      weekStart: dto.weekStart ?? wo.weekStart,
      weekEnd: dto.weekEnd ?? wo.weekEnd,
      spxOversightHoursL1: dto.spxOversightHoursL1 ?? wo.spxOversightHoursL1,
      spxOversightHoursL2: dto.spxOversightHoursL2 ?? wo.spxOversightHoursL2,
      spxOversightHoursL3: dto.spxOversightHoursL3 ?? wo.spxOversightHoursL3,
      assignedVendorId: dto.assignedVendorId === undefined ? wo.assignedVendorId : dto.assignedVendorId,
    },
    include: { assignedVendor: true },
  });
  return workOrderJson(updated, { assignedVendorName: await resolveVendorName(updated) });
};

async function transition(id, from, to) {
  const wo = await prisma.work_orders.findUnique({ where: { id }, include: { assignedVendor: true } });
  if (!wo) throw new AppError(404, "NOT_FOUND", "Work order not found.");
  if (wo.status === to) return wo;
  if (wo.status !== from) throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  return prisma.work_orders.update({ where: { id }, data: { status: to }, include: { assignedVendor: true } });
}

exports.issue = async (id, user) => {
  const wo = await prisma.work_orders.findUnique({
    where: { id },
    include: { afe: { include: { afp: true } }, assignedVendor: true },
  });
  if (!wo) throw new AppError(404, "NOT_FOUND", "Work order not found.");
  if (wo.status === "issued") {
    const full = await prisma.work_orders.findUnique({ where: { id }, include: { assignedVendor: true } });
    return workOrderJson(full, { assignedVendorName: await resolveVendorName(full) });
  }

  const vendor =
    wo.assignedVendor ||
    (await defaultVendor());
  if (vendor) {
    const expired =
      !vendor.insuranceOnFile ||
      (vendor.insuranceExpiry && vendor.insuranceExpiry < new Date());
    if (expired) {
      throw new AppError(
        422,
        "BUSINESS_RULE_VIOLATION",
        `Cannot issue work order: insurance for ${vendor.name} is missing or expired (Schedule 4).`,
      );
    }
  }

  const updated = await transition(id, "draft", "issued");
  if (wo.afe?.status === "approved") {
    await prisma.afes.update({ where: { id: wo.afeId }, data: { status: "active" } });
  }
  if (wo.afe?.afpLineId && wo.afe?.afp?.status === "approved") {
    await prisma.afp_lines.update({ where: { id: wo.afe.afpLineId }, data: { status: "active" } });
  }
  await notify.workOrderIssued(updated);
  return workOrderJson(updated, { assignedVendorName: await resolveVendorName(updated) });
};

exports.start = async (id) => {
  const updated = await transition(id, "issued", "in_progress");
  await notify.workOrderStarted(updated);
  return workOrderJson(updated, { assignedVendorName: await resolveVendorName(updated) });
};

exports.complete = async (id) => {
  const updated = await transition(id, "in_progress", "complete");
  await notify.workOrderCompleted(updated);
  return workOrderJson(updated, { assignedVendorName: await resolveVendorName(updated) });
};

exports.close = async (id) => {
  const updated = await transition(id, "complete", "closed");
  await notify.workOrderClosed(updated);
  return workOrderJson(updated, { assignedVendorName: await resolveVendorName(updated) });
};

exports.listAssignments = async (workOrderId) => {
  await ensureWo(workOrderId);
  const rows = await prisma.work_order_assignments.findMany({ where: { workOrderId, active: true } });
  return rows.map(assignmentJson);
};

exports.addAssignment = async (workOrderId, dto, user) => {
  const wo = await ensureWo(workOrderId);
  const assignee = await prisma.users.findUnique({ where: { id: dto.userId } });
  if (!assignee) throw new AppError(404, "NOT_FOUND", "User not found.");
  const def = await defaultVendor();
  const vendorId = wo.assignedVendorId || def?.id;
  if (assignee.vendorId !== vendorId) {
    throw new AppError(422, "BUSINESS_RULE_VIOLATION", "Assignee must belong to the assigned vendor org.");
  }
  const row = await prisma.work_order_assignments.create({
    data: {
      id: uuid("woa"),
      workOrderId,
      userId: dto.userId,
      roleOnOrder: dto.roleOnOrder,
      isPrimary: Boolean(dto.isPrimary),
    },
  });
  return assignmentJson(row);
};

exports.patchAssignment = async (workOrderId, assignmentId, dto) => {
  await ensureWo(workOrderId);
  const row = await prisma.work_order_assignments.findUnique({ where: { id: assignmentId } });
  if (!row || row.workOrderId !== workOrderId) throw new AppError(404, "NOT_FOUND", "Assignment not found.");
  const updated = await prisma.work_order_assignments.update({
    where: { id: assignmentId },
    data: {
      isPrimary: dto.isPrimary ?? row.isPrimary,
      roleOnOrder: dto.roleOnOrder ?? row.roleOnOrder,
      active: dto.active === undefined ? row.active : dto.active,
    },
  });
  return assignmentJson(updated);
};

exports.listTasks = async (workOrderId) => {
  await ensureWo(workOrderId);
  const rows = await prisma.work_order_tasks.findMany({ where: { workOrderId }, orderBy: { createdAt: "asc" } });
  return rows.map(taskJson);
};

exports.createTask = async (workOrderId, dto, user) => {
  await ensureWo(workOrderId);
  const row = await prisma.work_order_tasks.create({
    data: {
      id: uuid("wot"),
      workOrderId,
      title: dto.title,
      description: dto.description || "",
      assigneeUserId: dto.assigneeUserId || null,
      dueDate: dto.dueDate ? new Date(`${dto.dueDate}T00:00:00.000Z`) : null,
      createdByUserId: user.id,
      status: "open",
    },
  });
  return taskJson(row);
};

exports.findTask = async (taskId) => {
  const row = await prisma.work_order_tasks.findUnique({ where: { id: taskId } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Task not found.");
  return taskJson(row);
};

exports.updateTask = async (taskId, dto) => {
  const row = await prisma.work_order_tasks.findUnique({ where: { id: taskId } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Task not found.");
  if (["complete", "cancelled"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Completed or cancelled tasks cannot be edited.");
  }
  const updated = await prisma.work_order_tasks.update({
    where: { id: taskId },
    data: {
      title: dto.title ?? row.title,
      description: dto.description ?? row.description,
      assigneeUserId: dto.assigneeUserId === undefined ? row.assigneeUserId : dto.assigneeUserId,
      dueDate: dto.dueDate ? new Date(`${dto.dueDate}T00:00:00.000Z`) : row.dueDate,
    },
  });
  return taskJson(updated);
};

exports.startTask = async (taskId) => {
  const row = await prisma.work_order_tasks.findUnique({ where: { id: taskId } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Task not found.");
  if (row.status === "in_progress") return taskJson(row);
  if (row.status !== "open") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  return taskJson(await prisma.work_order_tasks.update({ where: { id: taskId }, data: { status: "in_progress" } }));
};

exports.completeTask = async (taskId) => {
  const row = await prisma.work_order_tasks.findUnique({ where: { id: taskId } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Task not found.");
  if (row.status === "complete") return taskJson(row);
  if (row.status !== "in_progress") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  return taskJson(await prisma.work_order_tasks.update({ where: { id: taskId }, data: { status: "complete" } }));
};

exports.cancelTask = async (taskId) => {
  const row = await prisma.work_order_tasks.findUnique({ where: { id: taskId } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Task not found.");
  if (row.status === "cancelled") return taskJson(row);
  if (!["open", "in_progress"].includes(row.status)) {
    throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  }
  return taskJson(await prisma.work_order_tasks.update({ where: { id: taskId }, data: { status: "cancelled" } }));
};

exports.listBlocks = async (user) => {
  const programId = requireProgramId(user);
  const rows = await prisma.farm_blocks.findMany({
    where: { programId },
    orderBy: { code: "asc" },
  });
  return rows.map((b) => ({
    id: b.id,
    code: b.code,
    label: b.label,
    areaHa: b.areaHa != null ? Number(b.areaHa) : null,
    treeCount: b.treeCount,
  }));
};

exports.listBlockAssignments = async (workOrderId) => {
  await ensureWo(workOrderId);
  const rows = await prisma.work_order_block_assignments.findMany({
    where: { workOrderId },
    include: { block: true, user: true },
  });
  return rows.map((r) => ({
    id: r.id,
    blockId: r.blockId,
    blockCode: r.block.code,
    userId: r.userId,
    userName: r.user?.name || null,
    roleOnBlock: r.roleOnBlock,
  }));
};

exports.addBlockAssignment = async (workOrderId, dto, user) => {
  await ensureWo(workOrderId);
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Only SPX can assign blocks.");
  const row = await prisma.work_order_block_assignments.create({
    data: {
      id: uuid("wob"),
      workOrderId,
      blockId: dto.blockId,
      userId: dto.userId || null,
      roleOnBlock: dto.roleOnBlock || "manager",
    },
  });
  return row;
};

async function ensureWo(id) {
  const wo = await prisma.work_orders.findUnique({ where: { id } });
  if (!wo) throw new AppError(404, "NOT_FOUND", "Work order not found.");
  return wo;
}
