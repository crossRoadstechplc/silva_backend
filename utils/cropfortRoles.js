const prisma = require("../config/database");

const CROPFORT_ROLES = [
  "field_supervisor",
  "bagro_office",
  "spx_validator",
  "farm_owner",
  "spx_platform_admin",
];

const FIELD_OS_TO_CROPFORT = {
  silva_owner: "farm_owner",
  silva_country_manager: "farm_owner",
  silva_finance: "farm_owner",
  spx_principal: "spx_validator",
  spx_account_handler: "spx_validator",
  spx_field_supervisor: "spx_validator",
  system_admin: "spx_platform_admin",
  vendor_admin: "bagro_office",
  vendor_manager: "bagro_office",
  vendor_supervisor: "bagro_office",
  vendor_field_lead: "field_supervisor",
  vendor_worker: "field_supervisor",
};

function inferCropfortRole(fieldOsRole) {
  return FIELD_OS_TO_CROPFORT[fieldOsRole] || null;
}

async function getCropfortRoles(userId, programId) {
  const rows = await prisma.cropfort_user_roles.findMany({
    where: { userId, programId },
    select: { role: true, assignedBlockIds: true },
  });
  if (rows.length) return rows;
  return [];
}

async function hasCropfortRole(userId, programId, allowedRoles) {
  const rows = await getCropfortRoles(userId, programId);
  if (rows.length) {
    return rows.some((r) => allowedRoles.includes(r.role));
  }
  const user = await prisma.users.findUnique({ where: { id: userId }, select: { role: true } });
  const inferred = inferCropfortRole(user?.role);
  return inferred ? allowedRoles.includes(inferred) : false;
}

async function isFarmOwner(userId, programId) {
  return hasCropfortRole(userId, programId, ["farm_owner"]);
}

async function getAssignedBlockIds(userId, programId) {
  const rows = await getCropfortRoles(userId, programId);
  const fieldRow = rows.find((r) => r.role === "field_supervisor");
  if (fieldRow?.assignedBlockIds?.length) return fieldRow.assignedBlockIds;
  return null;
}

module.exports = {
  CROPFORT_ROLES,
  FIELD_OS_TO_CROPFORT,
  inferCropfortRole,
  getCropfortRoles,
  hasCropfortRole,
  isFarmOwner,
  getAssignedBlockIds,
};
