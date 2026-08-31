const bcrypt = require("bcryptjs");
const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { requireProgramId } = require("../utils/programScope");
const { CROPFORT_ROLES } = require("../../utils/cropfortRoles");

const TENANT_CONFIG_FIELDS = [
  "cropfortCurrency",
  "cropfortAfeBandAMaxEtb",
  "cropfortAfeBandBMaxEtb",
  "cropfortAfeBandCMaxEtb",
  "cropfortRateFlagThresholdPct",
  "cropfortVarianceReviewPct",
  "cropfortOpexReserveMinMonths",
  "cropfortOpexReserveBalanceEtb",
  "cropfortOpexEnforcement",
  "cropfortHectareContractTotal",
  "cropfortPartialWeeklyRelease",
];

exports.listUsers = async (user) => {
  const programId = requireProgramId(user);

  const cropfortRoles = await prisma.cropfort_user_roles.findMany({
    where: { programId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
        },
      },
    },
  });

  const activeProgramUsers = await prisma.users.findMany({
    where: { activeProgramId: programId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
    },
  });

  const userMap = new Map();
  for (const u of activeProgramUsers) {
    userMap.set(u.id, { ...u, cropfortRoles: [] });
  }
  for (const row of cropfortRoles) {
    const existing = userMap.get(row.userId) ?? {
      ...row.user,
      cropfortRoles: [],
    };
    existing.cropfortRoles.push({
      role: row.role,
      assignedBlockIds: row.assignedBlockIds,
    });
    userMap.set(row.userId, existing);
  }

  return [...userMap.values()].sort((a, b) => a.name.localeCompare(b.name));
};

exports.assignRoles = async (user, userId, dto) => {
  const programId = requireProgramId(user);
  const target = await prisma.users.findUnique({ where: { id: userId } });
  if (!target) throw new AppError(404, "NOT_FOUND", "User not found.");

  for (const role of dto.roles) {
    if (!CROPFORT_ROLES.includes(role.role)) {
      throw new AppError(400, "VALIDATION_ERROR", `Invalid Cropfort role: ${role.role}`);
    }
    await prisma.cropfort_user_roles.upsert({
      where: {
        programId_userId_role: {
          programId,
          userId,
          role: role.role,
        },
      },
      create: {
        id: uuid("cfr"),
        programId,
        userId,
        role: role.role,
        assignedBlockIds: role.assignedBlockIds ?? [],
      },
      update: {
        assignedBlockIds: role.assignedBlockIds ?? [],
      },
    });
  }

  if (dto.removeRoles?.length) {
    await prisma.cropfort_user_roles.deleteMany({
      where: {
        programId,
        userId,
        role: { in: dto.removeRoles },
      },
    });
  }

  return exports.listUsers(user);
};

exports.suspendUser = async (adminUser, userId) => {
  requireProgramId(adminUser);
  const target = await prisma.users.findFirst({
    where: { id: userId, activeProgramId: adminUser.activeProgramId },
  });
  if (!target) throw new AppError(404, "NOT_FOUND", "User is not in this program.");

  await prisma.users.update({
    where: { id: userId },
    data: { active: false },
  });
  await prisma.refresh_sessions.deleteMany({ where: { userId } });
  return { userId, active: false };
};

exports.activateUser = async (adminUser, userId) => {
  requireProgramId(adminUser);
  const target = await prisma.users.findFirst({
    where: { id: userId, activeProgramId: adminUser.activeProgramId },
  });
  if (!target) throw new AppError(404, "NOT_FOUND", "User is not in this program.");

  await prisma.users.update({
    where: { id: userId },
    data: { active: true },
  });
  return { userId, active: true };
};

exports.getTenantConfig = async (user) => {
  const programId = requireProgramId(user);
  const program = await prisma.programs.findUnique({ where: { id: programId } });
  if (!program) throw new AppError(404, "NOT_FOUND", "Program not found.");

  const config = {};
  for (const field of TENANT_CONFIG_FIELDS) {
    const value = program[field];
    config[field] = value != null && typeof value === "object" && value.toNumber ? Number(value) : value;
  }
  return config;
};

exports.updateTenantConfig = async (user, dto) => {
  const programId = requireProgramId(user);
  const data = {};
  for (const field of TENANT_CONFIG_FIELDS) {
    if (dto[field] !== undefined) data[field] = dto[field];
  }
  if (!Object.keys(data).length) {
    throw new AppError(400, "VALIDATION_ERROR", "No config fields to update.");
  }

  const updated = await prisma.programs.update({
    where: { id: programId },
    data,
  });
  return exports.getTenantConfig({ ...user, activeProgramId: programId });
};

exports.provisionUser = async (adminUser, dto) => {
  const programId = requireProgramId(adminUser);
  const email = dto.email.toLowerCase().trim();
  const existing = await prisma.users.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "CONFLICT", "User with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(dto.password || "ChangeMeNow123!", 10);
  const userId = uuid("usr");
  const created = await prisma.users.create({
    data: {
      id: userId,
      name: dto.name,
      email,
      passwordHash,
      role: dto.fieldOsRole || "spx_field_supervisor",
      organizationId: dto.organizationId,
      active: dto.active !== false,
      activeProgramId: programId,
      memberships: {
        create: {
          id: uuid("mem"),
          organizationId: dto.organizationId,
          role: dto.fieldOsRole || "spx_field_supervisor",
        },
      },
    },
  });

  if (dto.cropfortRoles?.length) {
    await exports.assignRoles(adminUser, created.id, { roles: dto.cropfortRoles });
  }

  return {
    id: created.id,
    name: created.name,
    email: created.email,
    active: created.active,
  };
};
