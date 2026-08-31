const { z } = require("zod");

const createAfpBlockLine = z.object({
  planYear: z.coerce.number().int().min(2000).max(2100),
  blockId: z.string().min(1),
  activityId: z.string().min(1),
  plannedQty: z.coerce.number().positive(),
  sequence: z.coerce.number().int().nonnegative().optional(),
  plannedStart: z.string().datetime().optional().nullable(),
  plannedEnd: z.string().datetime().optional().nullable(),
});

const updateAfpBlockLine = createAfpBlockLine.partial();

const submitAfpBlockLines = z.object({
  lineIds: z.array(z.string().min(1)).min(1),
});

const updateElection = z.object({
  electionStatus: z.enum(["suggested", "elected"]),
});

const lineComment = z.object({
  comment: z.string().optional(),
});

module.exports = {
  createAfpBlockLine,
  updateAfpBlockLine,
  submitAfpBlockLines,
  updateElection,
  lineComment,
};
