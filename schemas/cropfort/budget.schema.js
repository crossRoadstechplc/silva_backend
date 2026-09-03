const { z } = require("zod");

const estimateBudget = z.object({
  operationKind: z.enum(["intervention", "project"]).optional(),
  farmEstateId: z.string().min(1).optional(),
  blockIds: z.array(z.string().min(1)).optional().default([]),
  activityIds: z.array(z.string().min(1)).min(1),
});

module.exports = { estimateBudget };
