/** When notifying a role, also deliver to these concrete user roles. */
const RECIPIENT_ROLE_ALIASES = {
  vendor_manager: ["vendor_manager", "vendor_admin"],
};

/** Roles whose inbox should include broadcast notifications for other roles. */
function inboxRolesFor(userRole) {
  const roles = new Set([userRole]);
  if (userRole === "vendor_admin") roles.add("vendor_manager");
  if (userRole === "system_admin") {
    roles.add("spx_principal");
    roles.add("spx_account_handler");
  }
  return [...roles];
}

function expandRecipientRoles(recipientRole) {
  return RECIPIENT_ROLE_ALIASES[recipientRole] ?? [recipientRole];
}

module.exports = { inboxRolesFor, expandRecipientRoles };
