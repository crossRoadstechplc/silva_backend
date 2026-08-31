const { z } = require("zod");

const createActivityMaster = z.object({
  templateId: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  laborNorm: z.coerce.number().nonnegative().optional().nullable(),
  materialNorm: z.coerce.number().nonnegative().optional().nullable(),
  serviceNorm: z.coerce.number().nonnegative().optional().nullable(),
});

const updateActivityMaster = z.object({
  name: z.string().min(1).optional(),
  laborNorm: z.coerce.number().nonnegative().optional().nullable(),
  materialNorm: z.coerce.number().nonnegative().optional().nullable(),
  serviceNorm: z.coerce.number().nonnegative().optional().nullable(),
});

module.exports = {
  createActivityMaster,
  updateActivityMaster,
};
