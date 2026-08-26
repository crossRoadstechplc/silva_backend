const { z } = require("zod");

exports.createAfeSchema = z
  .object({
    afpLineId: z.string().min(1).optional().nullable(),
    operatingDiscipline: z.string(),
    description: z.string().max(500),
    estimatedCostUsd: z.number().positive(),
    planningMode: z.enum(["planned", "ad_hoc"]).optional(),
    origin: z.enum(["spx_initiated", "silva_request", "vendor_request"]).optional(),
  })
  .superRefine((data, ctx) => {
    const mode = data.planningMode || "planned";
    if (mode === "planned" && !data.afpLineId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "afpLineId is required for planned AFEs",
        path: ["afpLineId"],
      });
    }
  });

exports.updateAfeSchema = z.object({
  afpLineId: z.string().min(1).optional().nullable(),
  operatingDiscipline: z.string().optional(),
  description: z.string().max(500).optional(),
  estimatedCostUsd: z.number().positive().optional(),
  planningMode: z.enum(["planned", "ad_hoc"]).optional(),
  origin: z.enum(["spx_initiated", "silva_request", "vendor_request"]).optional(),
});
