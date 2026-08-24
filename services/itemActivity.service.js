const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");

function commentJson(row) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    userId: row.userId,
    userName: row.user?.name ?? "User",
    content: row.content,
    mentions: row.mentions ?? [],
    timestamp: row.createdAt.toISOString(),
    type: "comment",
  };
}

function auditAsActivity(row) {
  return {
    id: row.id,
    timestamp: row.timestamp.toISOString(),
    type: row.action.includes("comment") ? "comment" : row.action.includes("valid") ? "validation" : "status_change",
    userId: row.userId ?? "",
    userName: row.user?.name ?? "System",
    oldState: row.oldValue,
    newState: row.newValue,
    comment: typeof row.newValue === "object" && row.newValue?.comment ? row.newValue.comment : undefined,
    action: row.action,
  };
}

exports.listActivity = async (entityType, entityId, user) => {
  if (!entityType || !entityId) {
    throw new AppError(400, "VALIDATION_ERROR", "entityType and entityId are required.");
  }

  const [audits, comments] = await Promise.all([
    prisma.audit_log.findMany({
      where: { entityType, entityId },
      orderBy: { timestamp: "desc" },
      take: 50,
      include: { user: { select: { name: true } } },
    }),
    prisma.item_comments.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const merged = [
    ...audits.map(auditAsActivity),
    ...comments.map(commentJson),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return merged.slice(0, 60);
};

exports.createComment = async (entityType, entityId, dto, user) => {
  if (!dto.content?.trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "Comment content is required.");
  }

  const row = await prisma.item_comments.create({
    data: {
      id: uuid("icm"),
      programId: user.activeProgramId ?? null,
      entityType,
      entityId,
      userId: user.id,
      content: dto.content.trim(),
      mentions: dto.mentions ?? [],
    },
    include: { user: { select: { name: true } } },
  });

  await prisma.audit_log.create({
    data: {
      id: uuid("aud"),
      programId: user.activeProgramId ?? null,
      userId: user.id,
      entityType,
      entityId,
      action: "comment_added",
      newValue: { content: dto.content.trim() },
    },
  });

  return commentJson(row);
};
