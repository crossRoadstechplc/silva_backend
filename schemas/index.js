const { z } = require("zod");

const commentBody = z.object({ comment: z.string().optional() }).optional().default({});
const reasonBody = z.object({ reason: z.string().min(1) });

const login = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const refresh = z.object({ refreshToken: z.string().min(1) });
const forgot = z.object({ email: z.string().email() });
const reset = z.object({ token: z.string().min(1), password: z.string().min(8) });
const changePassword = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
const signup = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  orgName: z.string().min(1),
  orgSlug: z.string().optional(),
  orgType: z.enum(["silva", "vendor"]),
  displayName: z.string().optional(),
  vendorCategory: z.string().optional(),
  branding: z.record(z.any()).optional(),
});

const registrationSubmit = z.object({
  orgType: z.enum(["silva", "vendor"]),
  orgName: z.string().min(1),
  orgSlug: z.string().optional(),
  displayName: z.string().optional(),
  legalName: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  contactTitle: z.string().optional(),
  assetInterests: z.string().optional(),
  estimatedHectares: z.number().positive().optional(),
  governanceNotes: z.string().optional(),
  vendorCategory: z.string().optional(),
  servicesProvided: z.string().optional(),
  insuranceOnFile: z.boolean().optional(),
  fieldCapacity: z.string().optional(),
  profileJson: z.record(z.any()).optional(),
});

const registrationActivate = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

const registrationReviewNotes = z.object({ notes: z.string().optional() });
const registrationReject = z.object({ notes: z.string().min(1) });
const contactSubmit = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  organization: z.string().optional(),
  subject: z.string().min(1),
  message: z.string().min(10).max(5000),
});
const programCreate = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  branding: z.record(z.any()).optional(),
});
const programInviteOrg = z.object({
  organizationId: z.string().optional(),
  orgSlug: z.string().optional(),
  email: z.string().email().optional(),
  roleInProgram: z.enum(["owner", "manager", "executor", "viewer"]).optional(),
});
const switchProgram = z.object({ programId: z.string().min(1) });
const tenantBranding = z.object({
  displayName: z.string().min(1).optional(),
  branding: z.record(z.any()).optional(),
});
const acceptProgramInvite = z.object({ token: z.string().min(1) });
const orgCreate = z.object({
  name: z.string().min(1),
  type: z.enum(["silva", "spx", "vendor"]),
  isDefaultExecutionPartner: z.boolean().optional(),
  category: z.string().optional(),
});
const orgPatch = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  isDefaultExecutionPartner: z.boolean().optional(),
});
const inviteCreate = z.object({ email: z.string().email(), role: z.string().min(1) });
const inviteAccept = z.object({ token: z.string().min(1), name: z.string().min(1), password: z.string().min(8) });
const userCreate = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().min(1),
  organizationId: z.string().min(1),
  password: z.string().min(8),
});
const userPatch = z.object({ name: z.string().min(1).optional(), email: z.string().email().optional() });
const membershipRole = z.object({ role: z.string().min(1) });

const afpCreate = z.object({
  year: z.number().int(),
  operatingDiscipline: z.string().min(1),
  activity: z.string().min(1),
  budgetAllocatedUsd: z.number().nonnegative(),
  kpiTarget: z.string().min(1),
  notes: z.string().nullable().optional(),
});
const afeCreate = z.object({
  afpLineId: z.string().min(1),
  operatingDiscipline: z.string().min(1),
  description: z.string().min(1),
  estimatedCostUsd: z.number().positive(),
});
const coaCreate = z.object({
  sourceAccount: z.string().min(1),
  glAccount: z.string().min(1),
  description: z.string().optional(),
});

const adHocRequestCreate = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  operatingDiscipline: z.string().min(1).optional(),
  urgency: z.enum(["low", "normal", "high", "emergency", "urgent"]).optional(),
  estimatedCostUsd: z.number().positive().nullable().optional(),
  farmEstateId: z.string().nullable().optional(),
  submit: z.boolean().optional(),
});

const adHocRequestUpdate = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    operatingDiscipline: z.string().min(1).optional(),
    urgency: z.enum(["low", "normal", "high", "emergency", "urgent"]).optional(),
    estimatedCostUsd: z.number().positive().nullable().optional(),
    farmEstateId: z.string().nullable().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field is required.",
  });

const adHocRequestDismiss = z.object({
  notes: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
}).refine((data) => Boolean((data.notes || data.reason || "").trim()), {
  message: "Dismissal reason is required.",
});

const adHocRequestConvert = z.object({
  afpLineId: z
    .union([z.string().min(1), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v && String(v).trim() ? String(v).trim() : null)),
  operatingDiscipline: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  estimatedCostUsd: z.number().positive(),
  notes: z.string().optional(),
});

const workPlanCreate = z.object({
  farmEstateId: z.string().min(1),
  totalAreaHa: z.number().positive().optional(),
  budgetYearLabel: z.string().min(1),
  budgetYearGc: z.number().int().min(2020).max(2100),
  fxEtbPerUsd: z.number().positive().optional(),
  parsedJson: z.record(z.any()).optional(),
  sourceAttachmentId: z.string().optional(),
});

const workPlanUpdate = z
  .object({
    farmEstateId: z.string().min(1).optional(),
    totalAreaHa: z.number().positive().nullable().optional(),
    budgetYearLabel: z.string().min(1).optional(),
    budgetYearGc: z.number().int().min(2020).max(2100).optional(),
    fxEtbPerUsd: z.number().positive().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field is required.",
  });

const farmEstateCreate = z.object({
  name: z.string().min(1),
  ownerOrganizationId: z.string().min(1).optional(),
  totalAreaHa: z.number().positive().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  vendorIds: z.array(z.string()).optional(),
  blocks: z
    .array(
      z.object({
        code: z.string().min(1),
        label: z.string().optional(),
        areaHa: z.number().optional(),
        treeCount: z.number().int().optional(),
      }),
    )
    .optional(),
});

const farmEstateUpdate = z.object({
  name: z.string().min(1).optional(),
  ownerOrganizationId: z.string().min(1).nullable().optional(),
  totalAreaHa: z.number().positive().nullable().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const farmEstateVendors = z.object({
  vendorIds: z.array(z.string()),
});

const farmBlockCreate = z.object({
  code: z.string().min(1),
  label: z.string().optional(),
  areaHa: z.number().optional(),
  treeCount: z.number().int().optional(),
});

const workPlanReview = z.object({
  notes: z.string().min(1).optional(),
});

const woCreate = z.object({
  afeId: z.string().min(1),
  category: z.string().min(1),
  activity: z.string().min(1),
  tier: z.enum(["retainer", "project", "special"]),
  weekStart: z.number().int(),
  weekEnd: z.number().int(),
  spxOversightHoursL1: z.number().int().optional(),
  spxOversightHoursL2: z.number().int().optional(),
  spxOversightHoursL3: z.number().int().optional(),
  assignedVendorId: z.string().nullable().optional(),
  activityCatalogId: z.string().nullable().optional(),
  blockIds: z.array(z.string()).optional(),
});

const ftCreate = z.object({
  workOrderId: z.string().min(1),
  activityCatalogId: z.string().optional(),
  ticketType: z.enum(["field_execution", "payroll_confirmation"]).optional(),
  activityRecorded: z.string().min(1),
  areaHa: z.number().nonnegative(),
  laborCount: z.number().int().nonnegative(),
  materialsUsed: z.string().optional(),
  ticketDate: z.string().min(1),
  actualQuantity: z.number().nonnegative().optional(),
  actualMandays: z.number().nonnegative().optional(),
  actualCostEtb: z.number().nonnegative().optional(),
});

const assignmentCreate = z.object({
  userId: z.string().min(1),
  roleOnOrder: z.string().min(1),
  isPrimary: z.boolean().optional(),
});

const taskCreate = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeUserId: z.string().optional(),
  dueDate: z.string().optional(),
});

const prCreate = z.object({
  workOrderId: z.string().min(1),
  fieldTicketId: z.string().min(1),
  type: z.enum(["bagro_fee", "reimbursable_cost", "vendor_fee"]),
  amountRequestedEtb: z.number().positive(),
});
const stlCreate = z.object({
  workOrderId: z.string().min(1),
  paymentRequestId: z.string().min(1),
  type: z.enum(["bagro_fee", "labor_wages", "vendor_payment"]),
  payee: z.string().min(1),
  amountEtb: z.number().positive(),
});
const vendorCreate = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  servicesProvided: z.string().optional(),
  prequalified: z.boolean().optional(),
  insuranceOnFile: z.boolean().optional(),
  insuranceExpiry: z.string().nullable().optional(),
  isDefaultExecutionPartner: z.boolean().optional(),
});
const contractCreate = z.object({
  vendorId: z.string().min(1),
  afeId: z.string().min(1),
  contractValueUsd: z.number().positive(),
  procurementRoute: z.enum(["sole_source", "competitive_tender"]),
  tenderStatus: z.enum(["n_a", "in_progress", "awarded"]).optional(),
  contractStart: z.string().min(1),
  contractEnd: z.string().min(1),
});
const scorecardCreate = z.object({
  vendorId: z.string().min(1),
  reviewPeriod: z.string().min(1),
  qualityScore: z.number().int().min(0).max(100),
  timelinessScore: z.number().int().min(0).max(100),
  costAdherenceScore: z.number().int().min(0).max(100),
  notes: z.string().optional(),
});
const revenueCreate = z.object({
  period: z.string().min(1),
  tier: z.enum(["retainer", "project", "special"]),
  feeDescription: z.string().min(1),
  amountUsd: z.number(),
  amountEtb: z.number().optional(),
  invoiceDate: z.string().min(1),
  paymentStatus: z.enum(["invoiced", "paid", "overdue"]).optional(),
});
const attachmentUpload = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});
const attachmentCreate = attachmentUpload.extend({ storageKey: z.string().min(1) });
const disclosureCreate = z.object({
  party: z.string().min(1),
  relationship: z.string().min(1),
  period: z.string().min(1),
  notes: z.string().optional(),
});
const ifsFormCreate = z.object({
  formType: z.enum([
    "daily_work_log",
    "pruning_completion",
    "fertilizer_application",
    "pest_disease_scout",
    "harvest_cherry_intake",
    "safety_stop_work",
    "equipment_downtime",
    "weather_field_readiness",
    "labor_attendance",
    "block_inspection",
  ]),
  title: z.string().optional(),
  workOrderId: z.string().optional(),
  fieldTicketId: z.string().optional(),
  blockRef: z.string().optional(),
  weekNumber: z.number().int().min(1).max(52).optional(),
  payload: z.record(z.any()).optional(),
  notes: z.string().optional(),
});
const seasonCalendarCreate = z.object({
  year: z.number().int().min(2020).max(2100),
  name: z.string().min(1),
  notes: z.string().optional(),
});
const seasonWindowCreate = z.object({
  operatingDiscipline: z.string().min(1),
  activity: z.string().min(1),
  weekStart: z.number().int().min(1).max(52),
  weekEnd: z.number().int().min(1).max(52),
  linkedWorkOrderId: z.string().optional(),
  notes: z.string().optional(),
});

const messageThreadCreate = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  counterpartyType: z.enum(["vendor", "asset_owner"]).optional(),
  counterpartyOrganizationId: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
});
const messageReply = z.object({
  body: z.string().min(1).max(10000),
});
const messageThreadPatch = z
  .object({
    status: z.enum(["open", "archived"]).optional(),
    entityType: z.string().nullable().optional(),
    entityId: z.string().nullable().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field is required.",
  });

module.exports = {
  commentBody,
  reasonBody,
  login,
  refresh,
  forgot,
  reset,
  changePassword,
  signup,
  registrationSubmit,
  registrationActivate,
  registrationReviewNotes,
  registrationReject,
  contactSubmit,
  programCreate,
  programInviteOrg,
  switchProgram,
  tenantBranding,
  acceptProgramInvite,
  orgCreate,
  orgPatch,
  inviteCreate,
  inviteAccept,
  userCreate,
  userPatch,
  membershipRole,
  afpCreate,
  afeCreate,
  woCreate,
  assignmentCreate,
  taskCreate,
  ftCreate,
  prCreate,
  stlCreate,
  vendorCreate,
  contractCreate,
  scorecardCreate,
  revenueCreate,
  attachmentUpload,
  attachmentCreate,
  disclosureCreate,
  coaCreate,
  ifsFormCreate,
  seasonCalendarCreate,
  seasonWindowCreate,
  workPlanCreate,
  workPlanUpdate,
  workPlanReview,
  farmEstateCreate,
  farmEstateUpdate,
  farmEstateVendors,
  farmBlockCreate,
  messageThreadCreate,
  messageReply,
  messageThreadPatch,
  adHocRequestCreate,
  adHocRequestUpdate,
  adHocRequestDismiss,
  adHocRequestConvert,
};
