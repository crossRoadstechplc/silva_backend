const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { rejectClientComputedFields } = require("../costDerivation.service");
const {
  applyFarmOwnerListFilter,
  serializeAfpBlockLineForFarmOwner,
  serializeAfpBlockLineForSpx,
} = require("../../lib/visibilityGate");
const {
  isFarmOwner,
  hasCropfortRole,
  getAssignedBlockIds,
} = require("../../utils/cropfortRoles");
const approvable = require("../../lib/approvable");
const auditCropfort = require("./auditCropfort.service");
const { requireProgramId } = require("../utils/programScope");

const lineInclude = {
  block: { select: { id: true, code: true, label: true } },
  activity: {
    select: {
      id: true,
      code: true,
      name: true,
      laborNorm: true,
      materialNorm: true,
      serviceNorm: true,
    },
  },
};

function serializeLine(line, farmOwner) {
  if (farmOwner) return serializeAfpBlockLineForFarmOwner(line);
  return serializeAfpBlockLineForSpx(line);
}

async function buildListWhere(user, programId, query) {
  const farmOwner = await isFarmOwner(user.id, programId);
  const fieldSupervisor = await hasCropfortRole(user.id, programId, ["field_supervisor"]);
  const assignedBlocks = await getAssignedBlockIds(user.id, programId);

  let where = { programId };
  if (query.planYear) where.planYear = Number(query.planYear);
  if (query.blockId) where.blockId = query.blockId;
  if (query.status) where.status = query.status;

  if (fieldSupervisor) {
    where.electionStatus = "elected";
    if (assignedBlocks?.length) {
      where.blockId = where.blockId
        ? { in: assignedBlocks.filter((id) => id === where.blockId) }
        : { in: assignedBlocks };
    }
  } else if (farmOwner) {
    if (query.status) {
      where.status = query.status;
    } else {
      where = applyFarmOwnerListFilter(where, true);
    }
  } else if (query.electionStatus) {
    where.electionStatus = query.electionStatus;
  }

  return { where, farmOwner };
}

exports.list = async (user, query) => {
  const programId = requireProgramId(user);
  const { where, farmOwner } = await buildListWhere(user, programId, query);
  const lines = await prisma.afp_block_lines.findMany({
    where,
    include: lineInclude,
    orderBy: [{ blockId: "asc" }, { sequence: "asc" }, { version: "desc" }],
  });
  return lines.map((line) => serializeLine(line, farmOwner));
};

exports.create = async (user, dto) => {
  const programId = requireProgramId(user);
  rejectClientComputedFields(dto);

  const block = await prisma.farm_blocks.findFirst({ where: { id: dto.blockId, programId } });
  if (!block) throw new AppError(404, "NOT_FOUND", "Farm block not found in this program.");

  const activity = await prisma.activity_master.findFirst({
    where: { id: dto.activityId, programId },
  });
  if (!activity) throw new AppError(404, "NOT_FOUND", "Activity not found in this program.");

  const line = await prisma.afp_block_lines.create({
    data: {
      id: uuid("abl"),
      programId,
      planYear: dto.planYear,
      blockId: dto.blockId,
      activityId: dto.activityId,
      plannedQty: dto.plannedQty,
      sequence: dto.sequence ?? 0,
      plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null,
      plannedEnd: dto.plannedEnd ? new Date(dto.plannedEnd) : null,
      createdByUserId: user.id,
    },
    include: lineInclude,
  });
  await auditCropfort.log(user.id, programId, "afp_block_line", line.id, "created", null, line);
  return serializeLine(line, false);
};

exports.update = async (user, lineId, dto) => {
  const programId = requireProgramId(user);
  rejectClientComputedFields(dto);
  const line = await prisma.afp_block_lines.findFirst({
    where: { id: lineId, programId, status: "draft" },
  });
  if (!line) throw new AppError(404, "NOT_FOUND", "Draft AFP block line not found.");

  const updated = await prisma.afp_block_lines.update({
    where: { id: lineId },
    data: {
      planYear: dto.planYear ?? line.planYear,
      blockId: dto.blockId ?? line.blockId,
      activityId: dto.activityId ?? line.activityId,
      plannedQty: dto.plannedQty ?? line.plannedQty,
      sequence: dto.sequence ?? line.sequence,
      plannedStart:
        dto.plannedStart !== undefined
          ? dto.plannedStart
            ? new Date(dto.plannedStart)
            : null
          : line.plannedStart,
      plannedEnd:
        dto.plannedEnd !== undefined
          ? dto.plannedEnd
            ? new Date(dto.plannedEnd)
            : null
          : line.plannedEnd,
    },
    include: lineInclude,
  });
  return serializeLine(updated, false);
};

exports.updateElection = async (user, lineId, electionStatus) => {
  const programId = requireProgramId(user);
  const allowed = await hasCropfortRole(user.id, programId, ["spx_validator", "farm_owner", "spx_platform_admin"]);
  if (!allowed) {
    throw new AppError(403, "FORBIDDEN", "Only SPX validators and farm owners may update election status.");
  }

  const line = await prisma.afp_block_lines.findFirst({ where: { id: lineId, programId } });
  if (!line) throw new AppError(404, "NOT_FOUND", "AFP block line not found.");

  const updated = await prisma.afp_block_lines.update({
    where: { id: lineId },
    data: { electionStatus },
    include: lineInclude,
  });
  await auditCropfort.log(user.id, programId, "afp_block_line", lineId, "election_updated", line, updated);
  return serializeLine(updated, false);
};

exports.submit = async (user, lineIds) => {
  const programId = requireProgramId(user);
  await approvable.submitLines("afp_block_line", lineIds, user, programId);
  const lines = await prisma.afp_block_lines.findMany({
    where: { id: { in: lineIds } },
    include: lineInclude,
  });
  return lines.map((line) => serializeLine(line, false));
};

exports.approveLine = async (user, lineId, comment) => {
  const programId = requireProgramId(user);
  const updated = await approvable.approveLine("afp_block_line", lineId, user, programId, comment);
  const line = await prisma.afp_block_lines.findUnique({
    where: { id: updated.id },
    include: lineInclude,
  });
  return serializeLine(line, false);
};

exports.returnLine = async (user, lineId, comment) => {
  const programId = requireProgramId(user);
  const updated = await approvable.returnLine("afp_block_line", lineId, user, programId, comment);
  const line = await prisma.afp_block_lines.findUnique({
    where: { id: updated.id },
    include: lineInclude,
  });
  return serializeLine(line, false);
};

exports.reopenLine = async (user, lineId) => {
  const programId = requireProgramId(user);
  const line = await prisma.afp_block_lines.findFirst({
    where: { id: lineId, programId, status: "returned" },
    include: lineInclude,
  });
  if (!line) throw new AppError(404, "NOT_FOUND", "Returned AFP block line not found.");
  const newLine = await approvable.reopenReturnedLine("afp_block_line", lineId, user, programId, {
    programId,
    planYear: line.planYear,
    blockId: line.blockId,
    activityId: line.activityId,
    electionStatus: line.electionStatus,
    sequence: line.sequence,
    plannedStart: line.plannedStart,
    plannedEnd: line.plannedEnd,
    plannedQty: line.plannedQty,
  });
  const withIncludes = await prisma.afp_block_lines.findUnique({
    where: { id: newLine.id },
    include: lineInclude,
  });
  return serializeLine(withIncludes, false);
};
