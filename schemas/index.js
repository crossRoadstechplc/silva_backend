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
  orgType: z.enum(["silva", "spx", "vendor"]),
  displayName: z.string().optional(),
  vendorCategory: z.string().optional(),
  branding: z.record(z.any()).optional(),
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
const ftCreate = z.object({
  workOrderId: z.string().min(1),
  activityRecorded: z.string().min(1),
  areaHa: z.number().nonnegative(),
  laborCount: z.number().int().nonnegative(),
  materialsUsed: z.string().optional(),
  ticketDate: z.string().min(1),
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
const coaCreate = z.object({
  sourceAccount: z.string().min(1),
  glAccount: z.string().min(1),
  description: z.string().optional(),
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
};
