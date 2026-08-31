const { z } = require("zod");

const budgetPreviewQuery = z.object({
  planYear: z.coerce.number().int().optional(),
  blockId: z.string().optional(),
  budgetMonth: z.string().optional(),
});

module.exports = {
  budgetPreviewQuery,
};
