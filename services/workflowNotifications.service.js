const { createNotification } = require("../jobs/queues");
const prisma = require("../config/database");

async function safeNotify(payload) {
  try {
    await createNotification(payload);
  } catch (err) {
    console.error("[workflowNotifications]", payload.triggerType, err.message);
  }
}

async function notifyRoles({ programId, triggerType, entityType, entityId, roles, message, dedupeHours }) {
  await Promise.all(
    roles.map((recipientRole) =>
      safeNotify({ programId, triggerType, entityType, entityId, recipientRole, message, dedupeHours }),
    ),
  );
}

async function notifyUser({
  programId,
  triggerType,
  entityType,
  entityId,
  recipientUserId,
  recipientRole,
  message,
  dedupeHours,
}) {
  if (!recipientUserId) return;
  await safeNotify({
    programId,
    triggerType,
    entityType,
    entityId,
    recipientUserId,
    recipientRole: recipientRole || "vendor_field_lead",
    message,
    dedupeHours,
  });
}

/** Work orders */
exports.workOrderIssued = async (wo) => {
  await notifyRoles({
    programId: wo.programId,
    triggerType: "wo_issued",
    entityType: "work_order",
    entityId: wo.id,
    roles: ["vendor_field_lead", "vendor_supervisor", "vendor_manager", "vendor_admin"],
    message: `Work order ${wo.id} issued: ${wo.activity}. Ready to start field execution.`,
  });
};

exports.workOrderStarted = async (wo) => {
  await notifyRoles({
    programId: wo.programId,
    triggerType: "wo_started",
    entityType: "work_order",
    entityId: wo.id,
    roles: ["spx_account_handler", "spx_field_supervisor"],
    message: `Work order ${wo.id} is in progress: ${wo.activity}.`,
  });
};

exports.workOrderCompleted = async (wo) => {
  await notifyRoles({
    programId: wo.programId,
    triggerType: "wo_completed",
    entityType: "work_order",
    entityId: wo.id,
    roles: ["spx_account_handler", "spx_principal"],
    message: `Work order ${wo.id} marked complete. Review field tickets and close when ready.`,
  });
};

exports.workOrderClosed = async (wo) => {
  await notifyRoles({
    programId: wo.programId,
    triggerType: "wo_closed",
    entityType: "work_order",
    entityId: wo.id,
    roles: ["silva_owner", "spx_account_handler"],
    message: `Work order ${wo.id} closed: ${wo.activity}.`,
  });
};

/** Field tickets */
exports.fieldTicketSubmitted = async (ft) => {
  await notifyRoles({
    programId: ft.programId,
    triggerType: "ft_submitted",
    entityType: "field_ticket",
    entityId: ft.id,
    roles: ["vendor_supervisor", "vendor_manager"],
    message: `Field ticket submitted for review: ${ft.activityRecorded} (${ft.id}).`,
  });
};

exports.fieldTicketVendorReviewed = async (ft) => {
  await notifyRoles({
    programId: ft.programId,
    triggerType: "ft_vendor_reviewed",
    entityType: "field_ticket",
    entityId: ft.id,
    roles: ["spx_field_supervisor", "spx_account_handler"],
    message: `Field ticket ${ft.id} passed vendor review — SPX validation required.`,
  });
};

exports.fieldTicketValidated = async (ft) => {
  await notifyUser({
    programId: ft.programId,
    triggerType: "ft_validated",
    entityType: "field_ticket",
    entityId: ft.id,
    recipientUserId: ft.submittedByUserId,
    recipientRole: "vendor_field_lead",
    message: `Field ticket ${ft.id} validated by SPX. You may create a payment request.`,
  });
  await notifyRoles({
    programId: ft.programId,
    triggerType: "ft_validated",
    entityType: "field_ticket",
    entityId: ft.id,
    roles: ["vendor_manager"],
    message: `Field ticket ${ft.id} validated — ready for invoicing.`,
  });
};

exports.fieldTicketRejected = async (ft) => {
  await notifyUser({
    programId: ft.programId,
    triggerType: "ft_rejected",
    entityType: "field_ticket",
    entityId: ft.id,
    recipientUserId: ft.submittedByUserId,
    recipientRole: "vendor_field_lead",
    message: `Field ticket ${ft.id} was rejected. Review and resubmit.`,
  });
};

/** Payment requests */
exports.paymentRequestSubmitted = async (pr) => {
  await notifyRoles({
    programId: pr.programId,
    triggerType: "pr_submitted",
    entityType: "payment_request",
    entityId: pr.id,
    roles: ["spx_account_handler", "spx_principal"],
    message: `Payment request ${pr.id} submitted for SPX verification (${Number(pr.amountRequestedEtb)} ETB).`,
  });
};

exports.paymentRequestVerified = async (pr) => {
  await notifyUser({
    programId: pr.programId,
    triggerType: "pr_verified",
    entityType: "payment_request",
    entityId: pr.id,
    recipientUserId: pr.requestedByUserId,
    recipientRole: "vendor_field_lead",
    message: `Payment request ${pr.id} verified. SPX will prepare owner settlement.`,
  });
  await notifyRoles({
    programId: pr.programId,
    triggerType: "pr_verified",
    entityType: "payment_request",
    entityId: pr.id,
    roles: ["spx_account_handler"],
    message: `Payment request ${pr.id} verified — create owner settlement.`,
  });
};

exports.paymentRequestRejected = async (pr) => {
  await notifyUser({
    programId: pr.programId,
    triggerType: "pr_rejected",
    entityType: "payment_request",
    entityId: pr.id,
    recipientUserId: pr.requestedByUserId,
    recipientRole: "vendor_field_lead",
    message: `Payment request ${pr.id} was rejected by SPX.`,
  });
};

exports.paymentRequestSettled = async (pr) => {
  await notifyUser({
    programId: pr.programId,
    triggerType: "pr_settled",
    entityType: "payment_request",
    entityId: pr.id,
    recipientUserId: pr.requestedByUserId,
    recipientRole: "vendor_field_lead",
    message: `Payment request ${pr.id} settled — payment complete.`,
  });
};

/** Settlements */
exports.settlementCreated = async (stl) => {
  await notifyRoles({
    programId: stl.programId,
    triggerType: "settlement_created",
    entityType: "owner_settlement",
    entityId: stl.id,
    roles: ["spx_account_handler", "spx_principal"],
    message: `Settlement ${stl.id} draft created for ${stl.payee} (${Number(stl.amountEtb)} ETB). Authorize when ready.`,
  });
};

exports.settlementAuthorized = async (stl) => {
  await notifyRoles({
    programId: stl.programId,
    triggerType: "settlement_authorized",
    entityType: "owner_settlement",
    entityId: stl.id,
    roles: ["silva_owner", "silva_finance"],
    message: `Settlement ${stl.id} authorized — mark as settled once payment is sent to ${stl.payee}.`,
  });
};

exports.settlementSettled = async (stl) => {
  await notifyRoles({
    programId: stl.programId,
    triggerType: "settlement_settled",
    entityType: "owner_settlement",
    entityId: stl.id,
    roles: ["spx_account_handler", "vendor_manager"],
    message: `Settlement ${stl.id} marked settled for ${stl.payee}.`,
  });
};

/** AFP / AFE */
exports.afpSubmitted = async (afp) => {
  await notifyRoles({
    programId: afp.programId,
    triggerType: "afp_submitted",
    entityType: "afp_line",
    entityId: afp.id,
    roles: ["silva_owner"],
    message: `Annual farm plan ${afp.id} submitted for Silva approval (${afp.year}).`,
  });
};

exports.afpApproved = async (afp) => {
  await notifyRoles({
    programId: afp.programId,
    triggerType: "afp_approved",
    entityType: "afp_line",
    entityId: afp.id,
    roles: ["spx_principal", "spx_account_handler"],
    message: `AFP ${afp.id} approved by Silva — ready for AFE and work order planning.`,
  });
};

exports.afeSubmitted = async (afe) => {
  await notifyRoles({
    programId: afe.programId,
    triggerType: "afe_submitted",
    entityType: "afe",
    entityId: afe.id,
    roles: ["spx_account_handler", "spx_principal"],
    message: `AFE ${afe.id} (Band ${afe.band}) submitted for SPX validation.`,
  });
};

exports.afePendingSilva = async (afe, message) => {
  const triggerType = afe.band === "B" ? "bandb_objection_window_opened" : "afe_pending";
  for (const role of ["silva_owner", "silva_country_manager"]) {
    await safeNotify({
      programId: afe.programId,
      triggerType,
      entityType: "afe",
      entityId: afe.id,
      recipientRole: role,
      message,
    });
  }
};

exports.afeApproved = async (afe) => {
  await notifyRoles({
    programId: afe.programId,
    triggerType: "afe_approved",
    entityType: "afe",
    entityId: afe.id,
    roles: ["spx_account_handler"],
    message: `AFE ${afe.id} (Band ${afe.band}) approved — work orders may be created.`,
  });
};

exports.afeRejected = async (afe) => {
  await notifyRoles({
    programId: afe.programId,
    triggerType: "afe_rejected",
    entityType: "afe",
    entityId: afe.id,
    roles: ["spx_account_handler"],
    message: `AFE ${afe.id} was rejected.`,
  });
};

/** Reports */
exports.reportGenerated = async (report) => {
  await notifyRoles({
    programId: report.programId,
    triggerType: "report_generated",
    entityType: "report",
    entityId: report.id,
    roles: ["spx_account_handler", "spx_principal"],
    message: `${report.type} report draft generated for ${report.period}. Add narrative and release to Silva.`,
  });
};

exports.reportReleased = async (report) => {
  await notifyRoles({
    programId: report.programId,
    triggerType: "report_released",
    entityType: "report",
    entityId: report.id,
    roles: ["silva_owner", "silva_finance", "silva_country_manager"],
    message: `${report.type} report for ${report.period} released — view and download from Reports.`,
  });
};

/** Work plans */
exports.workPlanSubmitted = async (plan) => {
  await notifyRoles({
    programId: plan.programId,
    triggerType: "workplan_submitted",
    entityType: "work_plan_submission",
    entityId: plan.id,
    roles: ["spx_account_handler", "spx_principal"],
    message: `Work plan ${plan.budgetYearLabel || plan.id} submitted for SPX review.`,
  });
};

exports.workPlanRevisionRequested = async (plan) => {
  await notifyRoles({
    programId: plan.programId,
    triggerType: "workplan_revision_requested",
    entityType: "work_plan_submission",
    entityId: plan.id,
    roles: ["vendor_admin", "vendor_manager"],
    message: `Work plan ${plan.budgetYearLabel || plan.id} sent back for revision.`,
  });
};

exports.workPlanAccepted = async (plan) => {
  await notifyRoles({
    programId: plan.programId,
    triggerType: "workplan_accepted",
    entityType: "work_plan_submission",
    entityId: plan.id,
    roles: ["vendor_admin", "vendor_manager"],
    message: `Work plan ${plan.budgetYearLabel || plan.id} accepted by SPX.`,
  });
};

exports.workPlanRejected = async (plan) => {
  await notifyRoles({
    programId: plan.programId,
    triggerType: "workplan_rejected",
    entityType: "work_plan_submission",
    entityId: plan.id,
    roles: ["vendor_admin", "vendor_manager"],
    message: `Work plan ${plan.budgetYearLabel || plan.id} was rejected.`,
  });
};

/** Platform admin */
exports.registrationSubmitted = async (request) => {
  const orgLabel = request.orgType === "vendor" ? "vendor" : "asset owner";
  await notifyRoles({
    triggerType: "registration_submitted",
    entityType: "registration_request",
    entityId: request.id,
    roles: ["spx_principal", "system_admin"],
    message: `New ${orgLabel} registration: ${request.orgName} (${request.contactEmail}). Review in Registrations.`,
  });
};

exports.contactReceived = async (submission) => {
  await notifyRoles({
    triggerType: "contact_received",
    entityType: "contact_submission",
    entityId: submission.id,
    roles: ["spx_principal", "system_admin"],
    message: `Contact form: ${submission.subject} — from ${submission.name}.`,
  });
};

/** Direct Messages (SPX ↔ vendor / asset owner) */
exports.messageReceived = async ({
  programId,
  threadId,
  subject,
  preview,
  senderUserId,
  senderOrganizationId,
  spxOrganizationId,
  counterpartyOrganizationId,
  counterpartyType,
}) => {
  const snippet = String(preview || "").slice(0, 120);
  const message = `New message on “${subject}”: ${snippet}`;
  const toSpx = senderOrganizationId !== spxOrganizationId;
  const roles = toSpx
    ? ["spx_principal", "spx_account_handler", "spx_field_supervisor"]
    : counterpartyType === "vendor"
      ? ["vendor_admin", "vendor_manager", "vendor_supervisor", "vendor_field_lead"]
      : ["silva_owner", "silva_country_manager", "silva_finance"];

  const counterpartOrgId = toSpx ? spxOrganizationId : counterpartyOrganizationId;
  const users = await prisma.users.findMany({
    where: {
      organizationId: counterpartOrgId,
      role: { in: roles },
      active: true,
      id: { not: senderUserId },
    },
    select: { id: true, role: true },
  });

  await Promise.all(
    users.map((u) =>
      notifyUser({
        programId,
        triggerType: "message_received",
        entityType: "message_thread",
        entityId: threadId,
        recipientUserId: u.id,
        recipientRole: u.role,
        message,
        dedupeHours: 0,
      }),
    ),
  );

  if (users.length === 0) {
    await notifyRoles({
      programId,
      triggerType: "message_received",
      entityType: "message_thread",
      entityId: threadId,
      roles,
      message,
      dedupeHours: 0,
    });
  }
};

/** Ad-hoc requests (Silva → SPX) */
exports.adHocRequestSubmitted = async (req) => {
  await notifyRoles({
    programId: req.programId,
    triggerType: "adhoc_submitted",
    entityType: "ad_hoc_request",
    entityId: req.id,
    roles: ["spx_principal", "spx_account_handler", "spx_field_supervisor"],
    message: `Ad-hoc request submitted: ${req.title}`,
    dedupeHours: 1,
  });
};

exports.adHocRequestDismissed = async (req) => {
  await notifyUser({
    programId: req.programId,
    triggerType: "adhoc_dismissed",
    entityType: "ad_hoc_request",
    entityId: req.id,
    recipientUserId: req.requestedByUserId,
    recipientRole: "silva_owner",
    message: `Ad-hoc request dismissed: ${req.title}${req.reviewNotes ? ` — ${req.reviewNotes}` : ""}`,
    dedupeHours: 1,
  });
};

exports.adHocRequestConverted = async (req, afe) => {
  await notifyUser({
    programId: req.programId,
    triggerType: "adhoc_converted",
    entityType: "afe",
    entityId: afe.id,
    recipientUserId: req.requestedByUserId,
    recipientRole: "silva_owner",
    message: `Ad-hoc request converted to AFE ${afe.id}: ${req.title}`,
    dedupeHours: 1,
  });
};
