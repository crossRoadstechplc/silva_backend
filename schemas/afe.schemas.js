const { z } = require("zod");

exports.createAfeSchema = z.object({
  afpLineId: z.string().min(1),
  operatingDiscipline: z.string(),
  description: z.string().max(500),
  estimatedCostUsd: z.number().positive(),
});

exports.updateAfeSchema = exports.createAfeSchema.partial();
