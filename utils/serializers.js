const { money, iso, isoDate } = require("./helpers");
const { isVendorRole } = require("./roles");

function userJson(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationType: user.organization?.type || user.organizationType || null,
    organizationId: user.organizationId,
    vendorId: user.vendorId || null,
    activeProgramId: user.activeProgramId || null,
    active: user.active,
    createdAt: iso(user.createdAt),
  };
}

function organizationJson(org) {
  const v = org.vendor;
  return {
    id: org.id,
    name: org.name,
    slug: org.slug || null,
    displayName: org.displayName || org.name,
    type: org.type,
    branding: org.brandingJson || null,
    status: org.status || "active",
    vendorId: v?.id || null,
    isDefaultExecutionPartner: Boolean(v?.isDefaultExecutionPartner || org.isDefaultExecutionPartner),
    active: org.active,
    createdAt: iso(org.createdAt),
  };
}

function inviteJson(inv) {
  return {
    id: inv.id,
    organizationId: inv.organizationId,
    vendorId: inv.vendorId || null,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    invitedByUserId: inv.invitedByUserId,
    expiresAt: iso(inv.expiresAt),
    createdAt: iso(inv.createdAt),
  };
}

function afpJson(row, actor) {
  return {
    id: row.id,
    year: row.year,
    operatingDiscipline: row.operatingDiscipline,
    activity: row.activity,
    budgetAllocatedUsd: actor && isVendorRole(actor.role) ? null : money(row.budgetAllocatedUsd),
    budgetAllocatedEtb: actor && isVendorRole(actor.role) ? null : row.budgetAllocatedEtb != null ? money(row.budgetAllocatedEtb) : null,
    kpiTarget: row.kpiTarget,
    status: row.status,
    silvaApproved: row.silvaApproved,
    approvalDate: isoDate(row.approvalDate),
    notes: row.notes ?? null,
    workPlanSubmissionId: row.workPlanSubmissionId ?? null,
    createdByUserId: row.createdByUserId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function afeJson(row) {
  return {
    id: row.id,
    afpLineId: row.afpLineId,
    operatingDiscipline: row.operatingDiscipline,
    description: row.description,
    estimatedCostUsd: money(row.estimatedCostUsd),
    band: row.band,
    planningMode: row.planningMode || "planned",
    spxValidated: row.spxValidated,
    silvaApprovalRequired: row.silvaApprovalRequired,
    silvaApproved: row.silvaApproved,
    approvalDate: isoDate(row.approvalDate),
    status: row.status,
    createdByUserId: row.createdByUserId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function workOrderJson(row, extra = {}) {
  return {
    id: row.id,
    afeId: row.afeId,
    category: row.category,
    activity: row.activity,
    tier: row.tier,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    spxOversightHoursL1: row.spxOversightHoursL1,
    spxOversightHoursL2: row.spxOversightHoursL2,
    spxOversightHoursL3: row.spxOversightHoursL3,
    assignedVendorId: row.assignedVendorId,
    assignedVendorName: row.assignedVendor?.name || extra.assignedVendorName || null,
    activityCatalogId: row.activityCatalogId ?? null,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    ...extra,
  };
}

function assignmentJson(row) {
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    userId: row.userId,
    roleOnOrder: row.roleOnOrder,
    isPrimary: row.isPrimary,
    createdAt: iso(row.createdAt),
  };
}

function taskJson(row) {
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    title: row.title,
    description: row.description,
    assigneeUserId: row.assigneeUserId,
    status: row.status,
    dueDate: isoDate(row.dueDate),
    createdByUserId: row.createdByUserId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function fieldTicketJson(row) {
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    submittedByUserId: row.submittedByUserId,
    activityCatalogId: row.activityCatalogId ?? null,
    ticketType: row.ticketType ?? "field_execution",
    activityRecorded: row.activityRecorded,
    areaHa: money(row.areaHa),
    laborCount: row.laborCount,
    materialsUsed: row.materialsUsed,
    actualQuantity: row.actualQuantity != null ? Number(row.actualQuantity) : null,
    actualMandays: row.actualMandays != null ? Number(row.actualMandays) : null,
    actualCostEtb: row.actualCostEtb != null ? money(row.actualCostEtb) : null,
    normValidation: row.normValidationJson ?? null,
    ticketDate: isoDate(row.ticketDate),
    signedOff: row.signedOff,
    signedOffByUserId: row.signedOffByUserId,
    signedOffAt: row.signedOffAt ? iso(row.signedOffAt) : null,
    status: row.status,
    paymentRequestId: row.paymentRequestId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function paymentRequestJson(row) {
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    fieldTicketId: row.fieldTicketId,
    requestedByUserId: row.requestedByUserId,
    type: row.type,
    amountRequestedEtb: money(row.amountRequestedEtb),
    dateSubmitted: isoDate(row.dateSubmitted),
    spxVerified: row.spxVerified,
    spxVerifiedByUserId: row.spxVerifiedByUserId,
    verifiedDate: isoDate(row.verifiedDate),
    status: row.status,
    settlementId: row.settlementId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function settlementJson(row) {
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    paymentRequestId: row.paymentRequestId,
    type: row.type,
    payee: row.payee,
    amountEtb: money(row.amountEtb),
    spxAuthorized: row.spxAuthorized,
    authorizedByUserId: row.authorizedByUserId,
    dateAuthorized: isoDate(row.dateAuthorized),
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function vendorJson(row) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    category: row.category,
    servicesProvided: row.servicesProvided,
    prequalified: row.prequalified,
    insuranceOnFile: row.insuranceOnFile,
    insuranceExpiry: isoDate(row.insuranceExpiry),
    status: row.status,
    isDefaultExecutionPartner: row.isDefaultExecutionPartner,
    createdAt: iso(row.createdAt),
  };
}

function contractJson(row) {
  return {
    id: row.id,
    vendorId: row.vendorId,
    afeId: row.afeId,
    contractValueUsd: money(row.contractValueUsd),
    procurementRoute: row.procurementRoute,
    tenderStatus: row.tenderStatus,
    contractStart: isoDate(row.contractStart),
    contractEnd: isoDate(row.contractEnd),
  };
}

function scorecardJson(row) {
  return {
    id: row.id,
    vendorId: row.vendorId,
    reviewPeriod: row.reviewPeriod,
    qualityScore: row.qualityScore,
    timelinessScore: row.timelinessScore,
    costAdherenceScore: row.costAdherenceScore,
    overallScore: row.overallScore,
    reviewedByUserId: row.reviewedByUserId,
    notes: row.notes,
    createdAt: iso(row.createdAt),
  };
}

function revenueJson(row) {
  return {
    id: row.id,
    period: row.period,
    tier: row.tier,
    feeDescription: row.feeDescription,
    amountEtb: money(row.amountEtb),
    amountUsd: money(row.amountUsd),
    invoiceDate: isoDate(row.invoiceDate),
    paymentStatus: row.paymentStatus,
  };
}

function notificationJson(row) {
  return {
    id: row.id,
    triggerType: row.triggerType,
    entityType: row.entityType,
    entityId: row.entityId,
    recipientRole: row.recipientRole,
    message: row.message,
    sentAt: iso(row.sentAt),
    acknowledged: row.acknowledged,
  };
}

function reportJson(row, extra = {}) {
  return {
    id: row.id,
    type: row.type,
    period: row.period,
    status: row.status,
    generatedAt: iso(row.generatedAt),
    narrative: row.narrative,
    releasedAt: row.releasedAt ? iso(row.releasedAt) : null,
    releasedByUserId: row.releasedByUserId,
    visibleToSilva: row.visibleToSilva,
    ...extra,
  };
}

function auditJson(row) {
  return {
    id: row.id,
    userId: row.userId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    oldValue: row.oldValue,
    newValue: row.newValue,
    timestamp: iso(row.timestamp),
  };
}

module.exports = {
  userJson,
  organizationJson,
  inviteJson,
  afpJson,
  afeJson,
  workOrderJson,
  assignmentJson,
  taskJson,
  fieldTicketJson,
  paymentRequestJson,
  settlementJson,
  vendorJson,
  contractJson,
  scorecardJson,
  revenueJson,
  notificationJson,
  reportJson,
  auditJson,
};
