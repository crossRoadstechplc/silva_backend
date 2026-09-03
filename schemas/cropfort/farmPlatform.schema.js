const { z } = require("zod");

const completeStage = z.object({});

const benchmarkCreate = z.object({
  activityId: z.string().min(1),
  neighbor1Name: z.string().optional().nullable(),
  neighbor2Name: z.string().optional().nullable(),
  neighbor1Rate: z.coerce.number().positive().optional().nullable(),
  neighbor2Rate: z.coerce.number().positive().optional().nullable(),
  useNormWage: z.boolean().optional(),
});

const workbookImport = z.object({
  planYear: z.coerce.number().int().optional(),
  stages: z.array(z.string().min(1)).optional(),
});

const benchmarkPropose = z.object({
  proposedRate: z.coerce.number().positive(),
});

const useNormWage = z.object({
  activityId: z.string().min(1),
});

const coreBundle = z.object({
  elected: z.boolean(),
});

const electionUpsert = z.object({
  planYear: z.coerce.number().int(),
  activityId: z.string().min(1),
  blockId: z.string().optional().nullable(),
  electionOverride: z.boolean().optional().nullable(),
  commercialAgreementRef: z.string().optional().nullable(),
  plannedDurationDays: z.coerce.number().int().positive().optional().nullable(),
});

const activityPlanUpsert = z.object({
  planYear: z.coerce.number().int(),
  activityId: z.string().min(1),
  blockId: z.string().optional().nullable(),
  plannedQty: z.coerce.number().positive(),
});

const feeScheduleUpsert = z.object({
  confirmedAnnualFee: z.coerce.number().nonnegative(),
  lines: z
    .array(
      z.object({
        label: z.string().min(1),
        annualFee: z.coerce.number().nonnegative().optional().nullable(),
        activationMonth: z.coerce.number().int().min(1).max(36).optional().nullable(),
        deferred: z.boolean().optional(),
      }),
    )
    .optional(),
});

const supervisorProgressUpsert = z.object({
  activityPlanId: z.string().min(1),
  pctComplete: z.enum(["pct_0", "pct_25", "pct_50", "pct_75", "pct_100"]),
  lastMovementDate: z.string().optional().nullable(),
});

const monthlyReportUpdate = z.object({
  fieldObservations: z.string().optional().nullable(),
  lookAheadNotes: z.string().optional().nullable(),
});

module.exports = {
  completeStage,
  workbookImport,
  benchmarkCreate,
  benchmarkPropose,
  useNormWage,
  coreBundle,
  electionUpsert,
  activityPlanUpsert,
  feeScheduleUpsert,
  supervisorProgressUpsert,
  monthlyReportUpdate,
};
