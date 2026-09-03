const { z } = require("zod");

exports.createAfeSchema = z
  .object({
    afpBlockLineId: z.string().min(1).optional(),
    afpLineId: z.string().min(1).optional(),
    operatingDiscipline: z.string(),
    description: z.string().max(500),
    estimatedCostEtb: z.number().positive(),
  })
  .refine((v) => Boolean(v.afpBlockLineId || v.afpLineId), {
    message: "Select an annual plan line (or legacy budget envelope)",
    path: ["afpBlockLineId"],
  });

exports.updateAfeSchema = z.object({
  afpBlockLineId: z.string().min(1).optional(),
  afpLineId: z.string().min(1).optional(),
  operatingDiscipline: z.string().optional(),
  description: z.string().max(500).optional(),
  estimatedCostEtb: z.number().positive().optional(),
});
