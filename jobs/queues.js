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

async function createNotification({
  triggerType,
  entityType,
  entityId,
  recipientRole,
  message,
  recipientUserId,
  programId,
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

  await prisma.notifications.createMany({
    data: userIds.map((id) => ({
      id: uuid("ntf"),
      triggerType,
      entityType,
      entityId,
      recipientRole,
      recipientUserId: id,
      message,
      programId: resolvedProgramId,
    })),
  });
}

module.exports = { createNotification, defaultProgramId };
