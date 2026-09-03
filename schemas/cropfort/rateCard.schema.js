const { z } = require("zod");

const createRateCardLine = z.object({
  resourceCode: z.string().min(1),
  resourceName: z.string().min(1),
  resourceType: z.enum(["material", "service"]).optional().nullable(),
  unitOfMeasure: z.string().min(1),
  rateEtb: z.coerce.number().positive(),
  benchmarkFarmARate: z.coerce.number().positive().optional().nullable(),
  benchmarkFarmBRate: z.coerce.number().positive().optional().nullable(),
  spxJustificationNote: z.string().optional().nullable(),
});

const updateRateCardLine = createRateCardLine.partial();

const submitRateCard = z.object({
  lineIds: z.array(z.string().min(1)).min(1),
});

const lineComment = z.object({
  comment: z.string().optional(),
});

module.exports = {
  createRateCardLine,
  updateRateCardLine,
  submitRateCard,
  lineComment,
};
