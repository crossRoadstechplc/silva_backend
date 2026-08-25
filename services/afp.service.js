const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { nextAfpId } = require("../utils/ids");
const { decimal, parseListQuery, meta } = require("../utils/helpers");
const { afpJson } = require("../utils/serializers");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const notify = require("./workflowNotifications.service");

function assertDraft(status) {
  if (status !== "draft") throw new AppError(400, "INVALID_STATE", "Only draft records can be edited.");
}

async function getScoped(id, user) {
  const row = await prisma.afp_lines.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "AFP line not found.");
  return row;
}

exports.findAll = async (query, user) => {
  const { page, pageSize, skip, take, statuses } = parseListQuery(query);
  const where = scopedWhere(user);
  if (query.year) where.year = Number(query.year);
  if (query.operatingDiscipline) where.operatingDiscipline = query.operatingDiscipline;
  if (statuses.length) where.status = { in: statuses };
  const [rows, total] = await Promise.all([
    prisma.afp_lines.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.afp_lines.count({ where }),
  ]);
  return { items: rows.map((r) => afpJson(r, user)), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => afpJson(await getScoped(id, user), user);

exports.create = async (dto, user) => {
  const id = await nextAfpId(dto.year);
  const row = await prisma.afp_lines.create({
    data: programCreateData(user, {
      id,
      year: dto.year,
      operatingDiscipline: dto.operatingDiscipline,
      activity: dto.activity,
      budgetAllocatedUsd: decimal(dto.budgetAllocatedUsd),
      kpiTarget: dto.kpiTarget,
      notes: dto.notes ?? null,
      createdByUserId: user.id,
    }),
  });
  return afpJson(row, user);
};

exports.update = async (id, dto, user) => {
  const row = await getScoped(id, user);
  assertDraft(row.status);
  const updated = await prisma.afp_lines.update({
    where: { id },
    data: {
      operatingDiscipline: dto.operatingDiscipline ?? row.operatingDiscipline,
      activity: dto.activity ?? row.activity,
      budgetAllocatedUsd: dto.budgetAllocatedUsd !== undefined ? decimal(dto.budgetAllocatedUsd) : undefined,
      kpiTarget: dto.kpiTarget ?? row.kpiTarget,
      notes: dto.notes === undefined ? undefined : dto.notes,
      year: dto.year ?? row.year,
    },
  });
  return afpJson(updated, user);
};

exports.submit = async (id, user) => {
  const row = await getScoped(id, user);
  if (row.status === "submitted") return afpJson(row, user);
  if (row.status !== "draft") throw new AppError(400, "INVALID_STATE", "Workflow transition not allowed.");
  const updated = await prisma.afp_lines.update({ where: { id }, data: { status: "submitted" } });
  await notify.afpSubmitted(updated);
  return afpJson(updated, user);
};

exports.approve = async (id, user) => {
  const row = await getScoped(id, user);
  if (row.status === "approved" || row.status === "active") return afpJson(row, user);

  const { isSilvaRole } = require("../utils/roles");
  const silvaActor = isSilvaRole(user.role);

  // Silva (asset owner) may approve from draft when they created the line (own budget).
  // SPX-prepared lines still require submitted before Silva approval.
  if (silvaActor && row.status === "draft" && row.createdByUserId === user.id) {
    const updated = await prisma.afp_lines.update({
      where: { id },
      data: { status: "approved", silvaApproved: true, approvalDate: new Date() },
    });
    await notify.afpApproved(updated);
    return afpJson(updated, user);
  }

  if (row.status !== "submitted") {
    throw new AppError(400, "INVALID_STATE", "AFP must be submitted to approve.");
  }
  // Maker-checker: SPX-created lines cannot be approved by the same user.
  // Silva may approve their org’s submitted lines even if they submitted (asset owner).
  if (!silvaActor && row.createdByUserId === user.id) {
    throw new AppError(409, "MAKER_CHECKER_VIOLATION", "Actor cannot approve own submission.");
  }
  const updated = await prisma.afp_lines.update({
    where: { id },
    data: { status: "approved", silvaApproved: true, approvalDate: new Date() },
  });
  await notify.afpApproved(updated);
  return afpJson(updated, user);
};

exports.close = async (id, user) => {
  const row = await getScoped(id, user);
  if (row.status === "closed") return afpJson(row, user);
  return afpJson(await prisma.afp_lines.update({ where: { id }, data: { status: "closed" } }), user);
};

exports.requireProgramId = requireProgramId;
