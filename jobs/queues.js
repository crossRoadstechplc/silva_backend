const prisma = require("../config/database");
const { uuid } = require("../utils/ids");

async function createNotification({ triggerType, entityType, entityId, recipientRole, message, recipientUserId }) {
  let userIds = [];
  if (recipientUserId) {
    userIds = [recipientUserId];
  } else {
    const users = await prisma.users.findMany({
      where: { role: recipientRole, active: true },
      select: { id: true },
    });
    userIds = users.map((u) => u.id);
  }

  if (userIds.length === 0) {
    await prisma.notifications.create({
      data: { id: uuid("ntf"), triggerType, entityType, entityId, recipientRole, message },
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
    })),
  });
}

module.exports = { createNotification };
