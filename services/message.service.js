const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { isSpxRole, isSilvaRole, isVendorRole } = require("../utils/roles");
const workflowNotifications = require("./workflowNotifications.service");

const MESSAGE_ROLES = new Set([
  "spx_principal",
  "spx_account_handler",
  "spx_field_supervisor",
  "vendor_admin",
  "vendor_manager",
  "vendor_supervisor",
  "vendor_field_lead",
  "silva_owner",
  "silva_country_manager",
  "silva_finance",
]);

const SPX_NOTIFY_ROLES = ["spx_principal", "spx_account_handler", "spx_field_supervisor"];
const VENDOR_NOTIFY_ROLES = ["vendor_admin", "vendor_manager", "vendor_supervisor", "vendor_field_lead"];
const OWNER_NOTIFY_ROLES = ["silva_owner", "silva_country_manager", "silva_finance"];

function assertCanMessage(user) {
  if (!MESSAGE_ROLES.has(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Messaging is not available for this role.");
  }
}

function programIdOf(user) {
  const programId = user.activeProgramId;
  if (!programId) throw new AppError(400, "VALIDATION_ERROR", "Active program is required.");
  return programId;
}

async function resolveSpxOrganizationId(programId) {
  const membership = await prisma.program_memberships.findFirst({
    where: {
      programId,
      organization: { type: "spx", active: true },
    },
    select: { organizationId: true },
  });
  if (membership) return membership.organizationId;

  const program = await prisma.programs.findUnique({
    where: { id: programId },
    select: { createdByOrgId: true, createdByOrg: { select: { type: true } } },
  });
  if (program?.createdByOrg?.type === "spx") return program.createdByOrgId;

  const spx = await prisma.organizations.findFirst({
    where: { type: "spx", active: true },
    select: { id: true },
  });
  if (!spx) throw new AppError(500, "CONFIG_ERROR", "No SPX organization found for messaging.");
  return spx.id;
}

function expectedOrgType(counterpartyType) {
  return counterpartyType === "vendor" ? "vendor" : "silva";
}

async function assertCounterpartyOrg(organizationId, counterpartyType, programId) {
  const org = await prisma.organizations.findUnique({ where: { id: organizationId } });
  if (!org || !org.active) throw new AppError(404, "NOT_FOUND", "Organization not found.");
  if (org.type !== expectedOrgType(counterpartyType)) {
    throw new AppError(400, "VALIDATION_ERROR", "Organization type does not match counterparty type.");
  }
  const membership = await prisma.program_memberships.findUnique({
    where: { programId_organizationId: { programId, organizationId } },
  });
  if (!membership) {
    throw new AppError(400, "VALIDATION_ERROR", "Organization is not a member of this program.");
  }
  return org;
}

function assertThreadAccess(thread, user) {
  if (user.role === "system_admin" || isSpxRole(user.role)) return;
  if (thread.counterpartyOrganizationId !== user.organizationId) {
    throw new AppError(403, "FORBIDDEN", "You do not have access to this conversation.");
  }
  if (isVendorRole(user.role) && thread.counterpartyType !== "vendor") {
    throw new AppError(403, "FORBIDDEN", "Vendors can only access vendor conversations.");
  }
  if (isSilvaRole(user.role) && thread.counterpartyType !== "asset_owner") {
    throw new AppError(403, "FORBIDDEN", "Asset owners can only access owner conversations.");
  }
}

async function attachmentSummaries(messageIds) {
  if (!messageIds.length) return new Map();
  const rows = await prisma.attachments.findMany({
    where: { entityType: "message", entityId: { in: messageIds } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      entityId: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      createdAt: true,
    },
  });
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.entityId) || [];
    list.push({
      id: row.id,
      fileName: row.fileName,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
    });
    map.set(row.entityId, list);
  }
  return map;
}

function messageJson(row, attachments = []) {
  return {
    id: row.id,
    threadId: row.threadId,
    senderUserId: row.senderUserId,
    senderName: row.sender?.name ?? "User",
    senderOrganizationId: row.senderOrganizationId,
    senderOrganizationName: row.senderOrganization?.displayName || row.senderOrganization?.name || null,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    attachments,
  };
}

function threadJson(row, { unreadCount = 0, lastMessage = null } = {}) {
  return {
    id: row.id,
    programId: row.programId,
    spxOrganizationId: row.spxOrganizationId,
    spxOrganizationName: row.spxOrganization?.displayName || row.spxOrganization?.name || null,
    counterpartyOrganizationId: row.counterpartyOrganizationId,
    counterpartyOrganizationName:
      row.counterpartyOrganization?.displayName || row.counterpartyOrganization?.name || null,
    counterpartyType: row.counterpartyType,
    subject: row.subject,
    status: row.status,
    entityType: row.entityType,
    entityId: row.entityId,
    createdByUserId: row.createdByUserId,
    lastMessageAt: row.lastMessageAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    unreadCount,
    lastMessagePreview: lastMessage?.body?.slice(0, 140) || null,
    lastMessageSenderName: lastMessage?.sender?.name || null,
  };
}

const threadInclude = {
  spxOrganization: { select: { id: true, name: true, displayName: true, type: true } },
  counterpartyOrganization: { select: { id: true, name: true, displayName: true, type: true } },
};

exports.listCounterparties = async (query, user) => {
  assertCanMessage(user);
  const programId = programIdOf(user);
  const type = query.type === "asset_owner" ? "asset_owner" : query.type === "vendor" ? "vendor" : null;
  if (!type) throw new AppError(400, "VALIDATION_ERROR", "type must be vendor or asset_owner.");

  if (!isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX can list counterparties.");
  }

  const orgType = expectedOrgType(type);
  const memberships = await prisma.program_memberships.findMany({
    where: {
      programId,
      organization: { type: orgType, active: true },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          displayName: true,
          type: true,
          vendor: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    organizationId: m.organization.id,
    name: m.organization.displayName || m.organization.name,
    type: m.organization.type,
    vendorId: m.organization.vendor?.id || null,
    vendorName: m.organization.vendor?.name || null,
  }));
};

exports.listThreads = async (query, user) => {
  assertCanMessage(user);
  const programId = programIdOf(user);

  const where = { programId };
  if (query.counterpartyType === "vendor" || query.counterpartyType === "asset_owner") {
    where.counterpartyType = query.counterpartyType;
  }
  if (query.status === "open" || query.status === "archived") {
    where.status = query.status;
  } else if (!query.status) {
    where.status = "open";
  }

  if (isVendorRole(user.role)) {
    where.counterpartyOrganizationId = user.organizationId;
    where.counterpartyType = "vendor";
  } else if (isSilvaRole(user.role)) {
    where.counterpartyOrganizationId = user.organizationId;
    where.counterpartyType = "asset_owner";
  }

  const rows = await prisma.message_threads.findMany({
    where,
    include: {
      ...threadInclude,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: { name: true } } },
      },
      reads: {
        where: { userId: user.id },
        take: 1,
      },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  const result = [];
  for (const row of rows) {
    const lastReadAt = row.reads[0]?.lastReadAt || null;
    const unreadCount = await prisma.messages.count({
      where: {
        threadId: row.id,
        ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
        NOT: { senderUserId: user.id },
      },
    });
    result.push(
      threadJson(row, {
        unreadCount,
        lastMessage: row.messages[0] || null,
      }),
    );
  }
  return result;
};

exports.createThread = async (dto, user) => {
  assertCanMessage(user);
  const programId = programIdOf(user);
  const subject = String(dto.subject || "").trim();
  const body = String(dto.body || "").trim();
  if (!subject) throw new AppError(400, "VALIDATION_ERROR", "Subject is required.");
  if (!body) throw new AppError(400, "VALIDATION_ERROR", "Message body is required.");

  const spxOrganizationId = await resolveSpxOrganizationId(programId);
  let counterpartyType;
  let counterpartyOrganizationId;

  if (isSpxRole(user.role)) {
    counterpartyType = dto.counterpartyType;
    if (counterpartyType !== "vendor" && counterpartyType !== "asset_owner") {
      throw new AppError(400, "VALIDATION_ERROR", "counterpartyType must be vendor or asset_owner.");
    }
    counterpartyOrganizationId = dto.counterpartyOrganizationId;
    if (!counterpartyOrganizationId) {
      throw new AppError(400, "VALIDATION_ERROR", "counterpartyOrganizationId is required.");
    }
    await assertCounterpartyOrg(counterpartyOrganizationId, counterpartyType, programId);
  } else if (isVendorRole(user.role)) {
    counterpartyType = "vendor";
    counterpartyOrganizationId = user.organizationId;
  } else if (isSilvaRole(user.role)) {
    counterpartyType = "asset_owner";
    counterpartyOrganizationId = user.organizationId;
  } else {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }

  const threadId = uuid("mth");
  const messageId = uuid("msg");
  const now = new Date();

  const thread = await prisma.$transaction(async (tx) => {
    const created = await tx.message_threads.create({
      data: {
        id: threadId,
        programId,
        spxOrganizationId,
        counterpartyOrganizationId,
        counterpartyType,
        subject,
        entityType: dto.entityType || null,
        entityId: dto.entityId || null,
        createdByUserId: user.id,
        lastMessageAt: now,
      },
      include: threadInclude,
    });
    await tx.messages.create({
      data: {
        id: messageId,
        threadId,
        senderUserId: user.id,
        senderOrganizationId: user.organizationId,
        body,
        createdAt: now,
      },
    });
    await tx.message_thread_reads.create({
      data: { threadId, userId: user.id, lastReadAt: now },
    });
    return created;
  });

  await workflowNotifications.messageReceived({
    programId,
    threadId,
    subject,
    preview: body,
    senderUserId: user.id,
    senderOrganizationId: user.organizationId,
    spxOrganizationId,
    counterpartyOrganizationId,
    counterpartyType,
  });

  return {
    ...threadJson(thread, { unreadCount: 0, lastMessage: { body, sender: { name: user.name } } }),
    firstMessageId: messageId,
  };
};

exports.getThread = async (threadId, user) => {
  assertCanMessage(user);
  const programId = programIdOf(user);
  const thread = await prisma.message_threads.findFirst({
    where: { id: threadId, programId },
    include: threadInclude,
  });
  if (!thread) throw new AppError(404, "NOT_FOUND", "Conversation not found.");
  assertThreadAccess(thread, user);

  const messages = await prisma.messages.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { id: true, name: true } },
      senderOrganization: { select: { id: true, name: true, displayName: true } },
    },
  });
  const attMap = await attachmentSummaries(messages.map((m) => m.id));

  return {
    thread: threadJson(thread),
    messages: messages.map((m) => messageJson(m, attMap.get(m.id) || [])),
  };
};

exports.reply = async (threadId, dto, user) => {
  assertCanMessage(user);
  const programId = programIdOf(user);
  const body = String(dto.body || "").trim();
  if (!body) throw new AppError(400, "VALIDATION_ERROR", "Message body is required.");

  const thread = await prisma.message_threads.findFirst({
    where: { id: threadId, programId },
    include: threadInclude,
  });
  if (!thread) throw new AppError(404, "NOT_FOUND", "Conversation not found.");
  assertThreadAccess(thread, user);
  if (thread.status === "archived") {
    throw new AppError(400, "INVALID_STATE", "This conversation is archived.");
  }

  const now = new Date();
  const messageId = uuid("msg");
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.messages.create({
      data: {
        id: messageId,
        threadId,
        senderUserId: user.id,
        senderOrganizationId: user.organizationId,
        body,
        createdAt: now,
      },
      include: {
        sender: { select: { id: true, name: true } },
        senderOrganization: { select: { id: true, name: true, displayName: true } },
      },
    });
    await tx.message_threads.update({
      where: { id: threadId },
      data: { lastMessageAt: now },
    });
    await tx.message_thread_reads.upsert({
      where: { threadId_userId: { threadId, userId: user.id } },
      create: { threadId, userId: user.id, lastReadAt: now },
      update: { lastReadAt: now },
    });
    return created;
  });

  await workflowNotifications.messageReceived({
    programId,
    threadId,
    subject: thread.subject,
    preview: body,
    senderUserId: user.id,
    senderOrganizationId: user.organizationId,
    spxOrganizationId: thread.spxOrganizationId,
    counterpartyOrganizationId: thread.counterpartyOrganizationId,
    counterpartyType: thread.counterpartyType,
  });

  return messageJson(message, []);
};

exports.markRead = async (threadId, user) => {
  assertCanMessage(user);
  const programId = programIdOf(user);
  const thread = await prisma.message_threads.findFirst({
    where: { id: threadId, programId },
  });
  if (!thread) throw new AppError(404, "NOT_FOUND", "Conversation not found.");
  assertThreadAccess(thread, user);

  const now = new Date();
  await prisma.message_thread_reads.upsert({
    where: { threadId_userId: { threadId, userId: user.id } },
    create: { threadId, userId: user.id, lastReadAt: now },
    update: { lastReadAt: now },
  });
  return { threadId, lastReadAt: now.toISOString() };
};

exports.patchThread = async (threadId, dto, user) => {
  assertCanMessage(user);
  const programId = programIdOf(user);
  const thread = await prisma.message_threads.findFirst({
    where: { id: threadId, programId },
    include: threadInclude,
  });
  if (!thread) throw new AppError(404, "NOT_FOUND", "Conversation not found.");
  assertThreadAccess(thread, user);

  const data = {};
  if (dto.status === "open" || dto.status === "archived") data.status = dto.status;
  if (dto.entityType !== undefined) data.entityType = dto.entityType || null;
  if (dto.entityId !== undefined) data.entityId = dto.entityId || null;
  if (Object.keys(data).length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "No changes provided.");
  }

  const updated = await prisma.message_threads.update({
    where: { id: threadId },
    data,
    include: threadInclude,
  });
  return threadJson(updated);
};

/** Used by attachment access checks */
exports.userCanAccessMessageEntity = async (messageId, user) => {
  if (!MESSAGE_ROLES.has(user.role)) return false;
  const message = await prisma.messages.findUnique({
    where: { id: messageId },
    include: { thread: true },
  });
  if (!message || message.thread.programId !== user.activeProgramId) return false;
  try {
    assertThreadAccess(message.thread, user);
    return true;
  } catch {
    return false;
  }
};

exports.MESSAGE_ROLES = MESSAGE_ROLES;
exports.SPX_NOTIFY_ROLES = SPX_NOTIFY_ROLES;
exports.VENDOR_NOTIFY_ROLES = VENDOR_NOTIFY_ROLES;
exports.OWNER_NOTIFY_ROLES = OWNER_NOTIFY_ROLES;
