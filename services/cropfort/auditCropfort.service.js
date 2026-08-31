const prisma = require("../../config/database");
const { uuid } = require("../../utils/ids");

async function log(actorUserId, programId, objectType, objectId, action, beforeValue, afterValue) {
  await prisma.audit_log.create({
    data: {
      id: uuid("aud"),
      programId,
      userId: actorUserId,
      entityType: objectType,
      entityId: objectId,
      action,
      oldValue: beforeValue ?? undefined,
      newValue: afterValue ?? undefined,
    },
  });
}

module.exports = { log };
