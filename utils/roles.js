const SILVA_ROLES = ["silva_owner", "silva_country_manager", "silva_finance"];
const SPX_ROLES = ["spx_principal", "spx_account_handler", "spx_field_supervisor", "system_admin"];
const SYSTEM_ROLES = [...SILVA_ROLES, ...SPX_ROLES];
const VENDOR_ROLES = [
  "vendor_admin",
  "vendor_manager",
  "vendor_supervisor",
  "vendor_field_lead",
  "vendor_worker",
];

function isVendorRole(role) {
  return VENDOR_ROLES.includes(role);
}
function isSilvaRole(role) {
  return SILVA_ROLES.includes(role);
}
function isSpxRole(role) {
  return SPX_ROLES.includes(role);
}

function orgTypeOf(user) {
  return user.organizationType || user.organization?.type || null;
}

function permissionsFor(role) {
  const perms = [];
  if (isSilvaRole(role) || isSpxRole(role) || isVendorRole(role)) {
    perms.push("afp.read", "work_orders.read", "notifications.read");
  }
  if (isSilvaRole(role) || isSpxRole(role)) {
    perms.push("afe.read", "vendors.read", "bva.read", "reports.read", "settlements.read");
  }
  if (role === "silva_owner" || role === "silva_country_manager") {
    perms.push("afp.approve", "afe.approve_band_c", "afe.approve_band_d");
  }
  if (isSpxRole(role)) {
    perms.push("afp.create", "afe.create", "afe.validate", "work_orders.manage", "field_tickets.validate");
  }
  if (role === "spx_principal") perms.push("revenue.read", "revenue.write", "afp.close");
  return perms;
}

module.exports = {
  SILVA_ROLES,
  SPX_ROLES,
  SYSTEM_ROLES,
  VENDOR_ROLES,
  isVendorRole,
  isSilvaRole,
  isSpxRole,
  orgTypeOf,
  permissionsFor,
};
