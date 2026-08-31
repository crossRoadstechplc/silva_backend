const { z } = require("zod");

const weekEndingParam = z.object({
  weekEnding: z.string().min(1),
});

const submitWeekly = z.object({
  ticketIds: z.array(z.string().min(1)).min(1),
});

module.exports = {
  weekEndingParam,
  submitWeekly,
};
