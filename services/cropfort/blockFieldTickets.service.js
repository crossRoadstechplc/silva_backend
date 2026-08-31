const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { rejectClientComputedFields } = require("../costDerivation.service");
const {
  applyReleasedOnlyFilter,
  serializeBlockFieldTicketForFarmOwner,
  serializeBlockFieldTicketForOps,
} = require("../../lib/visibilityGate");
const { isFarmOwner, hasCropfortRole, getAssignedBlockIds } = require("../../utils/cropfortRoles");
const { parseWeekEnding } = require("../../lib/cropfortWeek");
const auditCropfort = require("./auditCropfort.service");
const { requireProgramId } = require("../utils/programScope");

const ticketInclude = {
  block: { select: { id: true, code: true, label: true } },
  activity: { select: { id: true, code: true, name: true } },
};

function serializeTicket(ticket, farmOwner) {
  if (farmOwner) return serializeBlockFieldTicketForFarmOwner(ticket);
  return serializeBlockFieldTicketForOps(ticket);
}

async function assertElectedActivity(programId, blockId, activityId) {
  const line = await prisma.afp_block_lines.findFirst({
    where: {
      programId,
      blockId,
      activityId,
      electionStatus: "elected",
      status: "approved",
    },
  });
  if (!line) {
    throw new AppError(422, "NOT_ELECTED", "Activity is not elected for this block.");
  }
  return line;
}

async function buildListWhere(user, programId, query) {
  const farmOwner = await isFarmOwner(user.id, programId);
  const fieldSupervisor = await hasCropfortRole(user.id, programId, ["field_supervisor"]);
  const assignedBlocks = await getAssignedBlockIds(user.id, programId);

  let where = { programId };
  if (query.blockId) where.blockId = query.blockId;
  if (query.status) where.status = query.status;
  if (query.weekEnding) where.weekEnding = parseWeekEnding(query.weekEnding);

  if (farmOwner) {
    where = applyReleasedOnlyFilter(where, true);
  } else if (fieldSupervisor && assignedBlocks?.length) {
    where.blockId = query.blockId
      ? { in: assignedBlocks.filter((id) => id === query.blockId) }
      : { in: assignedBlocks };
  }

  return { where, farmOwner };
}

exports.list = async (user, query) => {
  const programId = requireProgramId(user);
  const { where, farmOwner } = await buildListWhere(user, programId, query);
  const tickets = await prisma.block_field_tickets.findMany({
    where,
    include: ticketInclude,
    orderBy: [{ weekEnding: "desc" }, { createdAt: "desc" }],
  });
  return tickets.map((t) => serializeTicket(t, farmOwner));
};

exports.create = async (user, dto) => {
  const programId = requireProgramId(user);
  rejectClientComputedFields(dto);

  const block = await prisma.farm_blocks.findFirst({ where: { id: dto.blockId, programId } });
  if (!block) throw new AppError(404, "NOT_FOUND", "Block not found.");

  const activity = await prisma.activity_master.findFirst({ where: { id: dto.activityId, programId } });
  if (!activity) throw new AppError(404, "NOT_FOUND", "Activity not found.");

  const ticket = await prisma.block_field_tickets.create({
    data: {
      id: uuid("bft"),
      programId,
      blockId: dto.blockId,
      activityId: dto.activityId,
      weekEnding: parseWeekEnding(dto.weekEnding),
      plannedQty: dto.plannedQty ?? null,
      actualQty: dto.actualQty,
      laborHoursActual: dto.laborHoursActual,
      materialsUsed: dto.materialsUsed ?? undefined,
      evidenceUrls: dto.evidenceUrls ?? [],
      clientLocalId: dto.clientLocalId ?? null,
      submittedByUserId: user.id,
    },
    include: ticketInclude,
  });
  await auditCropfort.log(user.id, programId, "block_field_ticket", ticket.id, "created", null, ticket);
  return serializeTicket(ticket, false);
};

exports.update = async (user, ticketId, dto) => {
  const programId = requireProgramId(user);
  rejectClientComputedFields(dto);
  const ticket = await prisma.block_field_tickets.findFirst({ where: { id: ticketId, programId } });
  if (!ticket) throw new AppError(404, "NOT_FOUND", "Ticket not found.");
  if (ticket.status === "released") {
    throw new AppError(409, "IMMUTABLE", "Released tickets cannot be modified. Create a correction ticket.");
  }
  if (ticket.status !== "draft" && ticket.status !== "reviewed_returned") {
    throw new AppError(400, "INVALID_STATE", "Only draft or returned tickets can be edited.");
  }

  const updated = await prisma.block_field_tickets.update({
    where: { id: ticketId },
    data: {
      plannedQty: dto.plannedQty !== undefined ? dto.plannedQty : ticket.plannedQty,
      actualQty: dto.actualQty ?? ticket.actualQty,
      laborHoursActual: dto.laborHoursActual ?? ticket.laborHoursActual,
      materialsUsed: dto.materialsUsed !== undefined ? dto.materialsUsed : ticket.materialsUsed,
      evidenceUrls: dto.evidenceUrls ?? ticket.evidenceUrls,
      weekEnding: dto.weekEnding ? parseWeekEnding(dto.weekEnding) : ticket.weekEnding,
      status: ticket.status === "reviewed_returned" ? "draft" : ticket.status,
    },
    include: ticketInclude,
  });
  return serializeTicket(updated, false);
};

exports.submit = async (user, ticketId) => {
  const programId = requireProgramId(user);
  const ticket = await prisma.block_field_tickets.findFirst({
    where: { id: ticketId, programId, status: "draft" },
    include: ticketInclude,
  });
  if (!ticket) throw new AppError(404, "NOT_FOUND", "Draft ticket not found.");

  await assertElectedActivity(programId, ticket.blockId, ticket.activityId);

  const updated = await prisma.block_field_tickets.update({
    where: { id: ticketId },
    data: { status: "submitted", submittedAt: new Date() },
    include: ticketInclude,
  });
  await auditCropfort.log(user.id, programId, "block_field_ticket", ticketId, "submitted", ticket, updated);
  return serializeTicket(updated, false);
};

exports.review = async (user, ticketId, dto) => {
  const programId = requireProgramId(user);
  const ticket = await prisma.block_field_tickets.findFirst({
    where: { id: ticketId, programId, status: "submitted" },
    include: ticketInclude,
  });
  if (!ticket) throw new AppError(404, "NOT_FOUND", "Submitted ticket not found for review.");

  const updated = await prisma.block_field_tickets.update({
    where: { id: ticketId },
    data: { status: dto.status, spxNote: dto.spxNote ?? ticket.spxNote },
    include: ticketInclude,
  });
  await auditCropfort.log(user.id, programId, "block_field_ticket", ticketId, "check_recorded", ticket, updated);
  return serializeTicket(updated, false);
};

exports.createCorrection = async (user, ticketId, dto) => {
  const programId = requireProgramId(user);
  const original = await prisma.block_field_tickets.findFirst({
    where: { id: ticketId, programId, status: "released" },
  });
  if (!original) {
    throw new AppError(404, "NOT_FOUND", "Released ticket not found for correction.");
  }

  const correction = await prisma.block_field_tickets.create({
    data: {
      id: uuid("bft"),
      programId,
      blockId: original.blockId,
      activityId: original.activityId,
      weekEnding: original.weekEnding,
      plannedQty: original.plannedQty,
      actualQty: dto.actualQty,
      laborHoursActual: dto.laborHoursActual,
      materialsUsed: dto.materialsUsed ?? original.materialsUsed ?? undefined,
      evidenceUrls: dto.evidenceUrls ?? original.evidenceUrls,
      supersedesId: original.id,
      submittedByUserId: user.id,
      status: "draft",
    },
    include: ticketInclude,
  });
  await auditCropfort.log(user.id, programId, "block_field_ticket", correction.id, "corrected", original, correction);
  return serializeTicket(correction, false);
};

exports.sync = async (user, payload) => {
  const programId = requireProgramId(user);
  const results = [];

  for (const item of payload.tickets) {
    const existing = item.clientLocalId
      ? await prisma.block_field_tickets.findFirst({
          where: { programId, clientLocalId: item.clientLocalId },
          include: ticketInclude,
        })
      : null;

    if (existing) {
      results.push({
        clientLocalId: item.clientLocalId,
        status: "already_synced",
        ticket: serializeTicket(existing, false),
      });
      continue;
    }

    const weekEnding = parseWeekEnding(item.weekEnding);
    const conflict = await prisma.block_field_tickets.findFirst({
      where: {
        programId,
        blockId: item.blockId,
        activityId: item.activityId,
        weekEnding,
        NOT: { clientLocalId: item.clientLocalId },
      },
    });

    if (conflict && Number(conflict.actualQty) !== Number(item.actualQty)) {
      const flagged = await prisma.block_field_tickets.create({
        data: {
          id: uuid("bft"),
          programId,
          blockId: item.blockId,
          activityId: item.activityId,
          weekEnding,
          plannedQty: item.plannedQty ?? null,
          actualQty: item.actualQty,
          laborHoursActual: item.laborHoursActual,
          materialsUsed: item.materialsUsed ?? undefined,
          evidenceUrls: item.evidenceUrls ?? [],
          clientLocalId: item.clientLocalId,
          submittedByUserId: user.id,
          status: "draft",
          spxNote: `Sync conflict with ticket ${conflict.id} — flagged for SPX review.`,
        },
        include: ticketInclude,
      });
      results.push({
        clientLocalId: item.clientLocalId,
        status: "conflict",
        ticket: serializeTicket(flagged, false),
        conflictWith: conflict.id,
      });
      continue;
    }

    const created = await exports.create(user, item);
    if (item.status === "submitted") {
      const submitted = await exports.submit(user, created.id);
      results.push({ clientLocalId: item.clientLocalId, status: "created", ticket: submitted });
    } else {
      results.push({ clientLocalId: item.clientLocalId, status: "created", ticket: created });
    }
  }

  return results;
};

exports.uploadPhoto = async (user, dto) => {
  const programId = requireProgramId(user);
  const storageKey = `cropfort/${programId}/${dto.clientLocalId || uuid("ph")}/${dto.fileName}`;
  const url = `/api/v1/attachments/pending/${encodeURIComponent(storageKey)}`;
  return {
    url,
    storageKey,
    fileName: dto.fileName,
    contentType: dto.contentType,
    sizeBytes: Buffer.byteLength(dto.dataBase64, "base64"),
    note: "Photo accepted for async upload — attach URL to ticket evidenceUrls on sync.",
  };
};
