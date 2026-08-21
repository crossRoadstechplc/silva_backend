const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid, hashToken, rawToken } = require("../utils/ids");
const { parseListQuery, meta } = require("../utils/helpers");

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function programJson(p, membership) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    branding: p.brandingJson || null,
    createdByOrgId: p.createdByOrgId,
    roleInProgram: membership?.roleInProgram || null,
    createdAt: p.createdAt.toISOString(),
  };
}

const DEFAULT_SCHEDULE3 = [
  { band: "A", minValueUsd: 0, maxValueUsd: 5000, spxAuthority: "Decide and issue AFE directly within approved AFP budget", silvaAuthority: "Informed in the monthly report", effectiveYear: new Date().getUTCFullYear() },
  { band: "B", minValueUsd: 5001, maxValueUsd: 20000, spxAuthority: "Issue AFE; Silva notified with objection window", silvaAuthority: "Informed; may object", effectiveYear: new Date().getUTCFullYear() },
  { band: "C", minValueUsd: 20001, maxValueUsd: 50000, spxAuthority: "Recommend", silvaAuthority: "Approve before issue", effectiveYear: new Date().getUTCFullYear() },
  { band: "D", minValueUsd: 50001, maxValueUsd: null, spxAuthority: "Recommend", silvaAuthority: "Approve before issue", effectiveYear: new Date().getUTCFullYear() },
];

const DEFAULT_RACI = [
  { operatingDiscipline: "Agronomic Operations", executeRole: "Execution partner", validateRole: "SPX", decideRole: "SPX", authorRole: "SPX", schedule3Ref: "AFE Bands A-D" },
  { operatingDiscipline: "Procurement & Tender", executeRole: "SPX", validateRole: "SPX", decideRole: "Silva (Band C/D)", authorRole: "SPX", schedule3Ref: "Procurement / tender" },
  { operatingDiscipline: "Contractor Appointment", executeRole: "SPX", validateRole: "SPX", decideRole: "Silva", authorRole: "SPX", schedule3Ref: "Vendor appointment / removal" },
  { operatingDiscipline: "Emergency / Stop-Work", executeRole: "Field / SPX", validateRole: "SPX", decideRole: "SPX (immediate)", authorRole: "SPX", schedule3Ref: "Safety override" },
  { operatingDiscipline: "Hiring", executeRole: "Execution partner", validateRole: "SPX", decideRole: "SPX", authorRole: "SPX", schedule3Ref: "Labor controls" },
  { operatingDiscipline: "Reporting Sign-Off", executeRole: "SPX", validateRole: "SPX Principal", decideRole: "SPX Principal", authorRole: "SPX", schedule3Ref: "Schedule 5 cadence" },
  { operatingDiscipline: "Infrastructure", executeRole: "Vendor", validateRole: "SPX", decideRole: "Silva (Band C/D)", authorRole: "SPX", schedule3Ref: "AFE Bands C-D" },
];

async function cloneProgramDefaults(programId) {
  await prisma.schedule3_thresholds.createMany({
    data: DEFAULT_SCHEDULE3.map((row) => ({ ...row, programId })),
  });
  await prisma.platform_config.create({
    data: { programId, fxRateEtbPerUsd: 57.2, enhancedGovernanceActive: true },
  });
  await prisma.accountability_matrix.createMany({
    data: DEFAULT_RACI.map((row) => ({ ...row, programId })),
  });
}

async function assertProgramMember(user, programId) {
  const membership = await prisma.program_memberships.findUnique({
    where: {
      programId_organizationId: { programId, organizationId: user.organizationId },
    },
  });
  if (!membership) {
    throw new AppError(403, "FORBIDDEN", "Your organization is not a member of this program.");
  }
  return membership;
}

exports.listPrograms = async (user) => {
  const memberships = await prisma.program_memberships.findMany({
    where: { organizationId: user.organizationId },
    include: { program: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => programJson(m.program, m));
};

exports.createProgram = async (user, dto) => {
  if (!["silva_owner", "silva_country_manager", "spx_principal", "system_admin"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only Silva or SPX admins can create programs.");
  }
  const base = slugify(dto.slug || dto.name);
  if (!base) throw new AppError(400, "VALIDATION_ERROR", "Program name is required.");
  let slug = base;
  let n = 1;
  while (await prisma.programs.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  const roleInProgram = user.organizationType === "silva" ? "owner" : "manager";
  const program = await prisma.programs.create({
    data: {
      id: uuid("prg"),
      name: dto.name,
      slug,
      brandingJson: dto.branding || null,
      createdByOrgId: user.organizationId,
      memberships: {
        create: {
          id: uuid("pm"),
          organizationId: user.organizationId,
          roleInProgram,
        },
      },
    },
  });
  await cloneProgramDefaults(program.id);
  await prisma.users.update({ where: { id: user.id }, data: { activeProgramId: program.id } });
  return programJson(program, { roleInProgram });
};

exports.inviteOrganization = async (user, programId, dto) => {
  await assertProgramMember(user, programId);
  if (!["silva_owner", "silva_country_manager", "spx_principal", "system_admin"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions to invite organizations.");
  }
  let toOrg = null;
  if (dto.organizationId) {
    toOrg = await prisma.organizations.findUnique({ where: { id: dto.organizationId } });
  } else if (dto.orgSlug) {
    toOrg = await prisma.organizations.findUnique({ where: { slug: String(dto.orgSlug).toLowerCase() } });
  }
  if (!toOrg && !dto.email) {
    throw new AppError(404, "NOT_FOUND", "Target organization not found. Provide orgSlug or organizationId.");
  }
  if (toOrg) {
    const existing = await prisma.program_memberships.findUnique({
      where: { programId_organizationId: { programId, organizationId: toOrg.id } },
    });
    if (existing) throw new AppError(409, "CONFLICT", "Organization is already a program member.");
  }
  const token = rawToken();
  const invite = await prisma.program_org_invites.create({
    data: {
      id: uuid("poi"),
      programId,
      fromOrganizationId: user.organizationId,
      toOrganizationId: toOrg?.id || null,
      toOrgSlug: dto.orgSlug || toOrg?.slug || null,
      toEmail: dto.email || null,
      roleInProgram: dto.roleInProgram || "executor",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    },
  });
  if (toOrg) {
    await prisma.program_memberships.create({
      data: {
        id: uuid("pm"),
        programId,
        organizationId: toOrg.id,
        roleInProgram: dto.roleInProgram || "executor",
      },
    });
    await prisma.program_org_invites.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    });
  }
  return {
    id: invite.id,
    programId,
    toOrganizationId: toOrg?.id || null,
    toOrgSlug: invite.toOrgSlug,
    status: toOrg ? "accepted" : "pending",
    acceptToken: toOrg ? null : token,
  };
};

exports.acceptProgramInvite = async (user, token) => {
  const invite = await prisma.program_org_invites.findFirst({
    where: { tokenHash: hashToken(token), status: "pending" },
  });
  if (!invite || invite.expiresAt < new Date()) {
    throw new AppError(404, "NOT_FOUND", "Invite not found or expired.");
  }
  const membership = await prisma.program_memberships.upsert({
    where: {
      programId_organizationId: {
        programId: invite.programId,
        organizationId: user.organizationId,
      },
    },
    create: {
      id: uuid("pm"),
      programId: invite.programId,
      organizationId: user.organizationId,
      roleInProgram: invite.roleInProgram,
    },
    update: {},
  });
  await prisma.program_org_invites.update({
    where: { id: invite.id },
    data: { status: "accepted", toOrganizationId: user.organizationId },
  });
  await prisma.users.update({ where: { id: user.id }, data: { activeProgramId: invite.programId } });
  return { programId: invite.programId, roleInProgram: membership.roleInProgram };
};

exports.switchProgram = async (user, programId) => {
  await assertProgramMember(user, programId);
  await prisma.users.update({ where: { id: user.id }, data: { activeProgramId: programId } });
  const program = await prisma.programs.findUnique({ where: { id: programId } });
  return programJson(program);
};

exports.getProgram = async (user, programId) => {
  const membership = await assertProgramMember(user, programId);
  const program = await prisma.programs.findUnique({ where: { id: programId } });
  if (!program) throw new AppError(404, "NOT_FOUND", "Program not found.");
  return programJson(program, membership);
};

exports.listMembers = async (user, programId) => {
  await assertProgramMember(user, programId);
  const rows = await prisma.program_memberships.findMany({
    where: { programId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    id: m.id,
    organizationId: m.organizationId,
    organizationName: m.organization.displayName || m.organization.name,
    organizationSlug: m.organization.slug,
    organizationType: m.organization.type,
    roleInProgram: m.roleInProgram,
    createdAt: m.createdAt.toISOString(),
  }));
};

exports.listOrgInvites = async (user, programId) => {
  await assertProgramMember(user, programId);
  if (!["silva_owner", "silva_country_manager", "spx_principal", "system_admin"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions to list program invites.");
  }
  const rows = await prisma.program_org_invites.findMany({
    where: { programId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    toOrganizationId: r.toOrganizationId,
    toOrgSlug: r.toOrgSlug,
    toEmail: r.toEmail,
    roleInProgram: r.roleInProgram,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
};

exports.updateTenantBranding = async (user, dto) => {
  if (!["silva_owner", "spx_principal", "vendor_admin", "system_admin"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const org = await prisma.organizations.update({
    where: { id: user.organizationId },
    data: {
      displayName: dto.displayName,
      brandingJson: dto.branding !== undefined ? dto.branding : undefined,
    },
  });
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    displayName: org.displayName,
    type: org.type,
    branding: org.brandingJson,
    status: org.status,
  };
};

exports.cloneProgramDefaults = cloneProgramDefaults;
exports.slugify = slugify;
exports.assertProgramMember = assertProgramMember;
exports.programJson = programJson;
