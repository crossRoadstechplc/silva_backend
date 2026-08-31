const { z } = require("zod");

const assignCropfortRoles = z.object({
  roles: z
    .array(
      z.object({
        role: z.enum([
          "field_supervisor",
          "bagro_office",
          "spx_validator",
          "farm_owner",
          "spx_platform_admin",
        ]),
        assignedBlockIds: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  removeRoles: z
    .array(
      z.enum([
        "field_supervisor",
        "bagro_office",
        "spx_validator",
        "farm_owner",
        "spx_platform_admin",
      ]),
    )
    .optional(),
});

const provisionCropfortUser = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  organizationId: z.string().min(1),
  fieldOsRole: z.string().optional(),
  password: z.string().min(12).optional(),
  active: z.boolean().optional(),
  cropfortRoles: z
    .array(
      z.object({
        role: z.enum([
          "field_supervisor",
          "bagro_office",
          "spx_validator",
          "farm_owner",
          "spx_platform_admin",
        ]),
        assignedBlockIds: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

const updateTenantConfig = z.object({
  cropfortCurrency: z.string().optional(),
  cropfortAfeBandAMaxEtb: z.coerce.number().positive().optional(),
  cropfortAfeBandBMaxEtb: z.coerce.number().positive().optional(),
  cropfortAfeBandCMaxEtb: z.coerce.number().positive().optional(),
  cropfortRateFlagThresholdPct: z.coerce.number().min(0).max(100).optional(),
  cropfortVarianceReviewPct: z.coerce.number().min(0).max(100).optional(),
  cropfortOpexReserveMinMonths: z.coerce.number().positive().optional(),
  cropfortOpexReserveBalanceEtb: z.coerce.number().nonnegative().optional().nullable(),
  cropfortOpexEnforcement: z.enum(["informational", "blocking"]).optional(),
  cropfortHectareContractTotal: z.coerce.number().positive().optional().nullable(),
  cropfortPartialWeeklyRelease: z.boolean().optional(),
});

module.exports = {
  assignCropfortRoles,
  provisionCropfortUser,
  updateTenantConfig,
};
