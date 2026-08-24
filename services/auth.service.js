const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/database");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { uuid, hashToken, rawToken } = require("../utils/ids");
const { userJson, organizationJson, inviteJson } = require("../utils/serializers");
const { isVendorRole, VENDOR_ROLES, SYSTEM_ROLES, permissionsFor } = require("../utils/roles");
const { parseListQuery, meta } = require("../utils/helpers");
const programService = require("./program.service");

function adminRoleForOrgType(type) {
  if (type === "silva") return "silva_owner";
  if (type === "spx") return "spx_principal";
  return "vendor_admin";
}

function signAccess(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationType: user.organization?.type,
      activeProgramId: user.activeProgramId || null,
      typ: "access",
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
  );
}

async function tokenBundle(user) {
  const full = await prisma.users.findUnique({
    where: { id: user.id },
    include: { organization: { include: { vendor: true } }, memberships: true },
  });
  const jti = uuid("ses");
  const refreshToken = jwt.sign({ sub: full.id, jti, typ: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });
  await prisma.refresh_sessions.create({
    data: {
      id: jti,
      userId: full.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN * 1000),
    },
  });
  return {
    accessToken: signAccess(full),
    refreshToken,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    user: userJson(full),
  };
}

exports.reissueTokens = async (userId) => {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new AppError(401, "UNAUTHENTICATED", "Invalid user.");
  return tokenBundle(user);
};

exports.login = async (email, password) => {
  const user = await prisma.users.findUnique({
    where: { email: email.toLowerCase() },
    include: { organization: true },
  });
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Invalid email or password.");
  if (!user.active) {
    throw new AppError(
      403,
      "ACCOUNT_INACTIVE",
      "Your account is not activated yet. Use the activation link from SPX or contact platform support.",
    );
  }
  if (user.organization?.status === "suspended") {
    throw new AppError(403, "FORBIDDEN", "Organization is suspended.");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new AppError(401, "UNAUTHENTICATED", "Invalid email or password.");
  return tokenBundle(user);
};

exports.signup = async () => {
  throw new AppError(
    403,
    "SIGNUP_DISABLED",
    "Public signup is disabled. Asset owners and vendors must apply for registration; SPX will activate approved accounts.",
  );
};

exports.logout = async (userId, refreshToken) => {
  if (refreshToken) {
    await prisma.refresh_sessions.updateMany({
      where: { userId, tokenHash: hashToken(refreshToken) },
      data: { revoked: true },
    });
  } else if (userId) {
    await prisma.refresh_sessions.updateMany({ where: { userId }, data: { revoked: true } });
  }
};

exports.refresh = async (refreshToken) => {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired token");
  }
  const session = await prisma.refresh_sessions.findFirst({
    where: { id: payload.jti, tokenHash: hashToken(refreshToken), revoked: false },
  });
  if (!session || session.expiresAt < new Date()) {
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired token");
  }
  await prisma.refresh_sessions.update({ where: { id: session.id }, data: { revoked: true } });
  const user = await prisma.users.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired token");
  return tokenBundle(user);
};

exports.me = async (user) => {
  const full = await prisma.users.findUnique({
    where: { id: user.id },
    include: { organization: true, memberships: true, activeProgram: true },
  });
  const programs = await programService.listPrograms({ organizationId: full.organizationId });
  return {
    user: userJson(full),
    tenant: {
      id: full.organization.id,
      name: full.organization.name,
      slug: full.organization.slug,
      displayName: full.organization.displayName || full.organization.name,
      type: full.organization.type,
      branding: full.organization.brandingJson || null,
      status: full.organization.status,
    },
    activeProgram: full.activeProgram
      ? {
          id: full.activeProgram.id,
          name: full.activeProgram.name,
          slug: full.activeProgram.slug,
          branding: full.activeProgram.brandingJson || null,
        }
      : null,
    programs,
    memberships: full.memberships.map((m) => ({
      id: m.id,
      userId: m.userId,
      organizationId: m.organizationId,
      role: m.role,
      active: m.active,
      createdAt: m.createdAt.toISOString(),
    })),
    permissions: permissionsFor(full.role),
  };
};

exports.forgotPassword = async (email) => {
  const user = await prisma.users.findUnique({ where: { email: email.toLowerCase() } });
  if (user) {
    await prisma.password_reset_tokens.create({
      data: {
        id: uuid("rst"),
        email: user.email,
        tokenHash: hashToken(rawToken()),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });
  }
};

exports.resetPassword = async (token, password) => {
  const row = await prisma.password_reset_tokens.findFirst({
    where: { tokenHash: hashToken(token), used: false },
  });
  if (!row || row.expiresAt < new Date()) {
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired reset token.");
  }
  const hash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.users.update({ where: { email: row.email }, data: { passwordHash: hash } }),
    prisma.password_reset_tokens.update({ where: { id: row.id }, data: { used: true } }),
  ]);
};

exports.listOrganizations = async (user, query) => {
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = {};
  if (isVendorRole(user.role)) where.id = user.organizationId;
  if (query.type) where.type = query.type;
  const [rows, total] = await Promise.all([
    prisma.organizations.findMany({ where, include: { vendor: true }, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.organizations.count({ where }),
  ]);
  return { items: rows.map(organizationJson), meta: meta(page, pageSize, total) };
};

exports.getOrganization = async (user, id) => {
  const org = await prisma.organizations.findUnique({ where: { id }, include: { vendor: true } });
  if (!org) throw new AppError(404, "NOT_FOUND", "Organization not found.");
  if (isVendorRole(user.role) && org.id !== user.organizationId) {
    throw new AppError(404, "NOT_FOUND", "Organization not found.");
  }
  return organizationJson(org);
};

exports.createOrganization = async (user, dto) => {
  if (dto.isDefaultExecutionPartner) {
    const existing = await prisma.vendors.findFirst({ where: { isDefaultExecutionPartner: true } });
    if (existing) throw new AppError(409, "CONFLICT", "Default execution partner already exists.");
  }
  const org = await prisma.organizations.create({
    data: {
      id: uuid("org"),
      name: dto.name,
      slug: programService.slugify(dto.slug || dto.name),
      displayName: dto.displayName || dto.name,
      type: dto.type,
      isDefaultExecutionPartner: Boolean(dto.isDefaultExecutionPartner),
      brandingJson: dto.branding || null,
    },
  });
  let vendor = null;
  if (dto.type === "vendor") {
    vendor = await prisma.vendors.create({
      data: {
        id: uuid("vnd"),
        organizationId: org.id,
        name: dto.name,
        category: dto.category || "General",
        isDefaultExecutionPartner: Boolean(dto.isDefaultExecutionPartner),
        status: "pending",
      },
    });
  }
  return organizationJson({ ...org, vendor });
};

exports.patchOrganization = async (user, id, dto) => {
  const org = await prisma.organizations.findUnique({ where: { id }, include: { vendor: true } });
  if (!org) throw new AppError(404, "NOT_FOUND", "Organization not found.");
  if (dto.isDefaultExecutionPartner !== undefined && user.role !== "spx_principal") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const updated = await prisma.organizations.update({
    where: { id },
    data: {
      name: dto.name ?? org.name,
      active: dto.active ?? org.active,
      isDefaultExecutionPartner: dto.isDefaultExecutionPartner ?? org.isDefaultExecutionPartner,
    },
    include: { vendor: true },
  });
  return organizationJson(updated);
};

exports.listMembers = async (user, organizationId, query) => {
  await exports.getOrganization(user, organizationId);
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = { organizationId };
  const [rows, total] = await Promise.all([
    prisma.organization_memberships.findMany({
      where,
      include: { user: true },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization_memberships.count({ where }),
  ]);
  return {
    items: rows.map((m) => ({
      id: m.id,
      role: m.role,
      active: m.active,
      user: { id: m.user.id, name: m.user.name, email: m.user.email, role: m.user.role, active: m.user.active },
    })),
    meta: meta(page, pageSize, total),
  };
};

exports.createInvite = async (user, organizationId, dto) => {
  const org = await prisma.organizations.findUnique({ where: { id: organizationId }, include: { vendor: true } });
  if (!org) throw new AppError(404, "NOT_FOUND", "Organization not found.");
  if (isVendorRole(user.role)) {
    if (user.organizationId !== org.id || user.role !== "vendor_admin") {
      throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
    }
    if (!VENDOR_ROLES.includes(dto.role)) throw new AppError(403, "FORBIDDEN", "Vendor admin cannot assign system roles.");
  }
  const pending = await prisma.invites.findFirst({
    where: { organizationId, email: dto.email.toLowerCase(), status: "pending" },
  });
  if (pending) throw new AppError(409, "CONFLICT", "A pending invite already exists for this email.");
  const token = rawToken();
  const invite = await prisma.invites.create({
    data: {
      id: uuid("inv"),
      organizationId,
      vendorId: org.vendor?.id || null,
      email: dto.email.toLowerCase(),
      role: dto.role,
      tokenHash: hashToken(token),
      invitedByUserId: user.id,
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    },
  });
  return inviteJson(invite);
};

exports.listInvites = async (user, organizationId, query) => {
  await exports.getOrganization(user, organizationId);
  const { page, pageSize, skip, take, statuses } = parseListQuery(query);
  const where = { organizationId };
  if (statuses.length) where.status = { in: statuses };
  const [rows, total] = await Promise.all([
    prisma.invites.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.invites.count({ where }),
  ]);
  return { items: rows.map(inviteJson), meta: meta(page, pageSize, total) };
};

exports.acceptInvite = async (inviteId, dto) => {
  const invite = await prisma.invites.findUnique({ where: { id: inviteId } });
  if (!invite) throw new AppError(404, "NOT_FOUND", "Invite not found.");
  if (invite.status !== "pending") throw new AppError(409, "CONFLICT", "Invite is no longer pending.");
  if (invite.expiresAt < new Date()) {
    await prisma.invites.update({ where: { id: inviteId }, data: { status: "expired" } });
    throw new AppError(409, "CONFLICT", "Invite has expired.");
  }
  if (hashToken(dto.token) !== invite.tokenHash) {
    throw new AppError(401, "UNAUTHENTICATED", "Invalid invite token.");
  }
  const existing = await prisma.users.findUnique({ where: { email: invite.email } });
  if (existing) throw new AppError(409, "CONFLICT", "User already exists.");
  const hash = await bcrypt.hash(dto.password, env.BCRYPT_ROUNDS);
  const created = await prisma.users.create({
    data: {
      id: uuid("usr"),
      name: dto.name,
      email: invite.email,
      passwordHash: hash,
      role: invite.role,
      organizationId: invite.organizationId,
      vendorId: invite.vendorId,
      memberships: { create: { id: uuid("mem"), organizationId: invite.organizationId, role: invite.role } },
    },
  });
  await prisma.invites.update({ where: { id: inviteId }, data: { status: "accepted" } });
  return tokenBundle(created);
};

exports.revokeInvite = async (user, inviteId) => {
  const invite = await prisma.invites.findUnique({ where: { id: inviteId } });
  if (!invite) throw new AppError(404, "NOT_FOUND", "Invite not found.");
  if (isVendorRole(user.role) && user.organizationId !== invite.organizationId) {
    throw new AppError(404, "NOT_FOUND", "Invite not found.");
  }
  const updated = await prisma.invites.update({ where: { id: inviteId }, data: { status: "revoked" } });
  return inviteJson(updated);
};

exports.listUsers = async (user, query) => {
  const where = {};
  if (isVendorRole(user.role)) {
    if (user.role !== "vendor_admin") throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
    where.vendorId = user.vendorId;
  } else if (!["spx_principal", "system_admin", "spx_account_handler"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  if (query.role) where.role = query.role;
  if (query.organizationId) where.organizationId = query.organizationId;
  if (query.vendorId) where.vendorId = query.vendorId;
  if (query.active === "true") where.active = true;
  if (query.active === "false") where.active = false;
  const { page, pageSize, skip, take, q } = parseListQuery(query);
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
  const [rows, total] = await Promise.all([
    prisma.users.findMany({ where, include: { organization: true }, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.users.count({ where }),
  ]);
  return { items: rows.map(userJson), meta: meta(page, pageSize, total) };
};

exports.getUser = async (user, userId) => {
  const found = await prisma.users.findUnique({ where: { id: userId }, include: { organization: true } });
  if (!found) throw new AppError(404, "NOT_FOUND", "User not found.");
  if (isVendorRole(user.role) && found.vendorId !== user.vendorId) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }
  return userJson(found);
};

exports.createUser = async (user, dto) => {
  const org = await prisma.organizations.findUnique({ where: { id: dto.organizationId }, include: { vendor: true } });
  if (!org) throw new AppError(404, "NOT_FOUND", "Organization not found.");
  const hash = await bcrypt.hash(dto.password, env.BCRYPT_ROUNDS);
  const created = await prisma.users.create({
    data: {
      id: uuid("usr"),
      name: dto.name,
      email: dto.email.toLowerCase(),
      passwordHash: hash,
      role: dto.role,
      organizationId: org.id,
      vendorId: org.vendor?.id || null,
      memberships: { create: { id: uuid("mem"), organizationId: org.id, role: dto.role } },
    },
    include: { organization: true },
  });
  return userJson(created);
};

exports.patchUser = async (user, userId, dto) => {
  const found = await prisma.users.findUnique({ where: { id: userId } });
  if (!found) throw new AppError(404, "NOT_FOUND", "User not found.");
  const isSelf = user.id === userId;
  const isAdmin = ["spx_principal", "system_admin", "vendor_admin"].includes(user.role);
  if (!isSelf && !isAdmin) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  if (user.role === "vendor_admin" && !isSelf && found.vendorId !== user.vendorId) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }
  const updated = await prisma.users.update({
    where: { id: userId },
    data: { name: dto.name ?? found.name, email: dto.email ? dto.email.toLowerCase() : found.email },
    include: { organization: true },
  });
  return userJson(updated);
};

exports.changePassword = async (user, dto) => {
  const found = await prisma.users.findUnique({ where: { id: user.id } });
  if (!found) throw new AppError(404, "NOT_FOUND", "User not found.");
  const ok = await bcrypt.compare(dto.currentPassword, found.passwordHash);
  if (!ok) throw new AppError(400, "INVALID_CREDENTIALS", "Current password is incorrect.");
  await prisma.users.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
  });
  return { ok: true };
};

exports.setUserActive = async (user, userId, active) => {
  const found = await prisma.users.findUnique({ where: { id: userId } });
  if (!found) throw new AppError(404, "NOT_FOUND", "User not found.");
  if (user.role === "vendor_admin" && found.vendorId !== user.vendorId) {
    throw new AppError(404, "NOT_FOUND", "User not found.");
  }
  const updated = await prisma.users.update({
    where: { id: userId },
    data: { active },
    include: { organization: true },
  });
  return userJson(updated);
};

exports.changeMembershipRole = async (user, membershipId, role) => {
  const membership = await prisma.organization_memberships.findUnique({ where: { id: membershipId } });
  if (!membership) throw new AppError(404, "NOT_FOUND", "Membership not found.");
  if (isVendorRole(user.role)) {
    if (user.role !== "vendor_admin" || user.organizationId !== membership.organizationId) {
      throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
    }
    if (SYSTEM_ROLES.includes(role)) throw new AppError(403, "FORBIDDEN", "Vendor admin cannot assign system roles.");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.organization_memberships.update({ where: { id: membershipId }, data: { role } });
    await tx.users.update({ where: { id: membership.userId }, data: { role } });
    return m;
  });
  return {
    id: updated.id,
    userId: updated.userId,
    organizationId: updated.organizationId,
    role: updated.role,
    active: updated.active,
    createdAt: updated.createdAt.toISOString(),
  };
};
