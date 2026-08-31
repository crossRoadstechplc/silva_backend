const { z } = require("zod");

const createBlockFieldTicket = z.object({
  blockId: z.string().min(1),
  activityId: z.string().min(1),
  weekEnding: z.string().min(1),
  plannedQty: z.coerce.number().nonnegative().optional().nullable(),
  actualQty: z.coerce.number().nonnegative(),
  laborHoursActual: z.coerce.number().nonnegative(),
  materialsUsed: z.record(z.unknown()).optional().nullable(),
  evidenceUrls: z.array(z.string().url()).optional(),
  clientLocalId: z.string().optional().nullable(),
});

const updateBlockFieldTicket = createBlockFieldTicket.partial();

const reviewBlockFieldTicket = z.object({
  status: z.enum(["reviewed_approved", "reviewed_flagged", "reviewed_returned"]),
  spxNote: z.string().optional().nullable(),
});

const createCorrection = z.object({
  actualQty: z.coerce.number().nonnegative(),
  laborHoursActual: z.coerce.number().nonnegative(),
  materialsUsed: z.record(z.unknown()).optional().nullable(),
  evidenceUrls: z.array(z.string().url()).optional(),
});

const syncBlockFieldTickets = z.object({
  tickets: z.array(
    createBlockFieldTicket.extend({
      clientLocalId: z.string().min(1),
      status: z.enum(["draft", "submitted"]).optional(),
    }),
  ),
});

const uploadTicketPhoto = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  dataBase64: z.string().min(1),
  clientLocalId: z.string().optional(),
});

module.exports = {
  createBlockFieldTicket,
  updateBlockFieldTicket,
  reviewBlockFieldTicket,
  createCorrection,
  syncBlockFieldTickets,
  uploadTicketPhoto,
};
