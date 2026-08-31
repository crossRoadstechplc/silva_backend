const prisma = require("../../config/database");
const { requireProgramId } = require("../utils/programScope");
const { isFarmOwner } = require("../../utils/cropfortRoles");

const CROPFORT_ENTITY_TYPES = new Set([
  "rate_card_line",
  "afp_block_line",
  "block_field_ticket",
  "weekly_submission",
  "cropfort_afe",
]);

const FARM_OWNER_VISIBLE_ACTIONS = new Set([
  "approved",
  "released",
  "submitted",
  "created",
  "check_recorded",
]);

exports.list = async (user, query) => {
  const programId = requireProgramId(user);
  const farmOwner = await isFarmOwner(user.id, programId);

  const where = { programId };
  if (query.entityType) where.entityType = query.entityType;
  if (query.entityId) where.entityId = query.entityId;
  if (query.actorUserId) where.userId = query.actorUserId;
  if (query.from || query.to) {
    where.timestamp = {};
    if (query.from) where.timestamp.gte = new Date(query.from);
    if (query.to) where.timestamp.lte = new Date(query.to);
  }

  if (farmOwner) {
    where.entityType = query.entityType
      ? query.entityType
      : { in: [...CROPFORT_ENTITY_TYPES] };
    where.action = { in: [...FARM_OWNER_VISIBLE_ACTIONS] };
  } else if (!query.entityType) {
    where.entityType = { in: [...CROPFORT_ENTITY_TYPES] };
  }

  const rows = await prisma.audit_log.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { timestamp: "desc" },
    take: Math.min(Number(query.limit) || 100, 500),
  });

  return rows.map((row) => ({
    id: row.id,
    programId: row.programId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    actor: row.user
      ? { id: row.user.id, name: row.user.name, email: row.user.email }
      : null,
    timestamp: row.timestamp,
    oldValue: farmOwner ? undefined : row.oldValue,
    newValue: farmOwner ? sanitizeForFarmOwner(row.newValue) : row.newValue,
  }));
};

function sanitizeForFarmOwner(value) {
  if (!value || typeof value !== "object") return value;
  const copy = { ...value };
  delete copy.benchmarkFarmARate;
  delete copy.benchmarkFarmBRate;
  delete copy.variancePct;
  delete copy.isFlagged;
  delete copy.evidenceUrls;
  delete copy.clientLocalId;
  delete copy.spxNote;
  return copy;
}
