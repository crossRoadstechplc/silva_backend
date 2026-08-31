const { z } = require("zod");

const createCropfortAfe = z.object({
  title: z.string().min(1),
  amountEtb: z.coerce.number().positive(),
  sourceType: z.enum(["afp_line", "weekly_submission", "intervention", "project", "manual"]),
  sourceId: z.string().optional().nullable(),
});

const updateCropfortAfe = createCropfortAfe.partial();

const submitCropfortAfes = z.object({
  afeIds: z.array(z.string().min(1)).min(1),
});

const lineComment = z.object({
  comment: z.string().optional(),
});

module.exports = {
  createCropfortAfe,
  updateCropfortAfe,
  submitCropfortAfes,
  lineComment,
};
