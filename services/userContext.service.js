const prisma = require("../config/database");
const { isVendorRole } = require("../utils/roles");

/**
 * When a user has exactly one program membership and no active program, select it automatically.
 * Returns the active program id (existing or newly set).
 */
async function ensureActiveProgram(user) {
  if (user.activeProgramId) return user.activeProgramId;
  const memberships = await prisma.program_memberships.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "asc" },
    select: { programId: true },
  });
  if (memberships.length !== 1) return null;
  const programId = memberships[0].programId;
  await prisma.users.update({
    where: { id: user.id },
    data: { activeProgramId: programId },
  });
  return programId;
}

/**
 * Vendor users should always have vendorId set from their organization.
 * Returns the vendor id (existing or newly resolved).
 */
async function ensureVendorId(user) {
  if (!isVendorRole(user.role) || user.vendorId) return user.vendorId || null;
  const vendor = await prisma.vendors.findFirst({
    where: { organizationId: user.organizationId },
    select: { id: true },
  });
  if (!vendor) return null;
  await prisma.users.update({
    where: { id: user.id },
    data: { vendorId: vendor.id },
  });
  return vendor.id;
}

async function hydrateUserContext(user) {
  const [activeProgramId, vendorId] = await Promise.all([
    ensureActiveProgram(user),
    ensureVendorId(user),
  ]);
  return {
    activeProgramId: activeProgramId ?? user.activeProgramId ?? null,
    vendorId: vendorId ?? user.vendorId ?? null,
    changed: Boolean(
      (activeProgramId && activeProgramId !== user.activeProgramId) ||
        (vendorId && vendorId !== user.vendorId),
    ),
  };
}

module.exports = {
  ensureActiveProgram,
  ensureVendorId,
  hydrateUserContext,
};
