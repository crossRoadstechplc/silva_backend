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

/** Mirrors silva_frontend/src/mocks/permissions.ts — UI permission keys from /auth/me */
const ROLE_PERMISSIONS = {
  silva_owner: [
    "afp.read",
    "afp.approve",
    "afe.read",
    "afe.approve_band_c",
    "afe.approve_band_d",
    "work_orders.read",
    "payment_requests.read_verified",
    "settlements.read",
    "reports.read_released",
    "vendors.read_summary",
    "dashboard.silva_owner",
    "notifications.read",
  ],
  silva_country_manager: [
    "afp.read",
    "afp.approve",
    "afe.read",
    "afe.approve_band_c",
    "afe.approve_band_d",
    "work_orders.read",
    "payment_requests.read_verified",
    "settlements.read",
    "reports.read_released",
    "vendors.read_summary",
    "dashboard.silva_owner",
    "notifications.read",
  ],
  silva_finance: [
    "afp.read",
    "afe.read",
    "work_orders.read",
    "payment_requests.read_verified",
    "settlements.read",
    "settlements.mark_settled",
    "reports.read_released",
    "dashboard.silva_owner",
    "notifications.read",
  ],
  spx_principal: [
    "afp.read",
    "afp.create",
    "afp.close",
    "afe.read",
    "afe.create",
    "afe.validate",
    "afe.approve_band_a",
    "afe.approve_band_b",
    "work_orders.full",
    "field_tickets.validate",
    "payment_requests.verify",
    "settlements.authorize",
    "revenue_ledger.full",
    "reports.release",
    "vendors.manage",
    "dashboard.spx_management",
    "audit.read",
    "notifications.read",
  ],
  spx_account_handler: [
    "afp.read",
    "afp.create",
    "afe.read",
    "afe.create",
    "afe.validate",
    "afe.approve_band_a",
    "afe.approve_band_b",
    "work_orders.create",
    "work_orders.issue",
    "field_tickets.validate",
    "payment_requests.verify",
    "settlements.authorize",
    "reports.draft",
    "vendors.manage",
    "dashboard.spx_management",
    "notifications.read",
  ],
  spx_field_supervisor: [
    "afp.read",
    "afe.read",
    "work_orders.read",
    "field_tickets.validate",
    "dashboard.spx_management",
    "notifications.read",
  ],
  system_admin: ["users.manage", "organizations.manage", "audit.read", "notifications.read"],
  vendor_admin: [
    "work_orders.read_own",
    "users.invite",
    "field_tickets.create",
    "dashboard.vendor_field",
    "notifications.read",
  ],
  vendor_manager: [
    "work_orders.read_own",
    "tasks.create",
    "field_tickets.create",
    "payment_requests.create",
    "dashboard.vendor_field",
    "notifications.read",
  ],
  vendor_supervisor: [
    "work_orders.read_own",
    "tasks.create",
    "field_tickets.review",
    "dashboard.vendor_field",
    "notifications.read",
  ],
  vendor_field_lead: [
    "work_orders.read_own",
    "field_tickets.create",
    "tasks.create",
    "payment_requests.create",
    "dashboard.vendor_field",
    "notifications.read",
  ],
  vendor_worker: [
    "work_orders.read_own",
    "field_tickets.create",
    "dashboard.vendor_field",
    "notifications.read",
  ],
};

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
  return ROLE_PERMISSIONS[role] ?? [];
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
