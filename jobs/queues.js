const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { expandRecipientRoles } = require("../utils/notificationRoles");

async function defaultProgramId() {
  const program = await prisma.programs.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return program?.id ?? null;
}

/** Skip if the same unread alert was already sent within `dedupeHours` (default 24). */
async function alreadyNotified({
  triggerType,
  entityType,
  entityId,
  recipientRole,
  recipientUserId,
  programId,
  dedupeHours = 24,
}) {
  const since = new Date(Date.now() - dedupeHours * 3600 * 1000);
  const existing = await prisma.notifications.findFirst({
    where: {
      triggerType,
      entityType,
      entityId,
      recipientRole,
      programId: programId || null,
      acknowledged: false,
      sentAt: { gte: since },
      ...(recipientUserId ? { recipientUserId } : {}),
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function createNotification({
  triggerType,
  entityType,
  entityId,
  recipientRole,
  message,
  recipientUserId,
  programId,
  dedupeHours = 24,
}) {
  const resolvedProgramId = programId ?? (await defaultProgramId());
  let userIds = [];

  if (recipientUserId) {
    userIds = [recipientUserId];
  } else {
    const targetRoles = expandRecipientRoles(recipientRole);
    const users = await prisma.users.findMany({
      where: {
        role: { in: targetRoles },
        active: true,
        ...(resolvedProgramId ? { activeProgramId: resolvedProgramId } : {}),
      },
      select: { id: true },
    });
    userIds = [...new Set(users.map((u) => u.id))];
  }

  if (userIds.length === 0) {
    if (
      await alreadyNotified({
        triggerType,
        entityType,
        entityId,
        recipientRole,
        programId: resolvedProgramId,
        dedupeHours,
      })
    ) {
      return;
    }
    await prisma.notifications.create({
      data: {
        id: uuid("ntf"),
        triggerType,
        entityType,
        entityId,
        recipientRole,
        message,
        programId: resolvedProgramId,
      },
    });
    return;
  }

  const rows = [];
  for (const id of userIds) {
    if (
      await alreadyNotified({
        triggerType,
        entityType,
        entityId,
        recipientRole,
        recipientUserId: id,
        programId: resolvedProgramId,
        dedupeHours,
      })
    ) {
      continue;
    }
    rows.push({
      id: uuid("ntf"),
      triggerType,
      entityType,
      entityId,
      recipientRole,
      recipientUserId: id,
      message,
      programId: resolvedProgramId,
    });
  }
  if (rows.length) await prisma.notifications.createMany({ data: rows });
}

module.exports = { createNotification, defaultProgramId };
