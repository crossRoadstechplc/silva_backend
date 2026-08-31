const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { parseWeekEnding } = require("../../lib/cropfortWeek");
const auditCropfort = require("./auditCropfort.service");
const validationService = require("./validation.service");
const { requireProgramId } = require("../utils/programScope");

const submissionInclude = {
  tickets: {
    include: {
      blockFieldTicket: {
        include: {
          block: { select: { id: true, code: true, label: true } },
          activity: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
  checks: { orderBy: { createdAt: "asc" } },
};

function serializeSubmission(row) {
  return {
    id: row.id,
    programId: row.programId,
    weekEnding: row.weekEnding,
    status: row.status,
    submittedAt: row.submittedAt,
    releasedAt: row.releasedAt,
    ticketCount: row.tickets?.length ?? 0,
    tickets: row.tickets?.map((t) => ({
      id: t.blockFieldTicket.id,
      blockCode: t.blockFieldTicket.block?.code,
      activityCode: t.blockFieldTicket.activity?.code,
      activityName: t.blockFieldTicket.activity?.name,
      status: t.blockFieldTicket.status,
      actualQty: Number(t.blockFieldTicket.actualQty),
    })),
    checks: row.checks?.map((c) => ({
      id: c.id,
      checkType: c.checkType,
      result: c.result,
      isHardBlock: c.isHardBlock,
      note: c.note,
      resolvedAt: c.resolvedAt,
    })),
  };
}

async function getOrCreateSubmission(programId, weekEnding) {
  const existing = await prisma.weekly_submissions.findUnique({
    where: { programId_weekEnding: { programId, weekEnding } },
    include: submissionInclude,
  });
  if (existing) return existing;
  return prisma.weekly_submissions.create({
    data: {
      id: uuid("wks"),
      programId,
      weekEnding,
      status: "pending",
    },
    include: submissionInclude,
  });
}

exports.list = async (user, query) => {
  const programId = requireProgramId(user);
  const where = { programId };
  if (query.status) where.status = query.status;
  if (query.weekEnding) where.weekEnding = parseWeekEnding(query.weekEnding);

  const rows = await prisma.weekly_submissions.findMany({
    where,
    include: submissionInclude,
    orderBy: { weekEnding: "desc" },
  });
  return rows.map(serializeSubmission);
};

exports.getByWeek = async (user, weekEndingValue) => {
  const programId = requireProgramId(user);
  const weekEnding = parseWeekEnding(weekEndingValue);
  const row = await getOrCreateSubmission(programId, weekEnding);
  return serializeSubmission(row);
};

exports.submitWeek = async (user, weekEndingValue, ticketIds) => {
  const programId = requireProgramId(user);
  const weekEnding = parseWeekEnding(weekEndingValue);

  const tickets = await prisma.block_field_tickets.findMany({
    where: {
      programId,
      id: { in: ticketIds },
      weekEnding,
      status: "submitted",
    },
  });
  if (tickets.length !== ticketIds.length) {
    throw new AppError(400, "INVALID_STATE", "All tickets must be submitted for this week.");
  }

  const submission = await getOrCreateSubmission(programId, weekEnding);
  if (submission.status === "released") {
    throw new AppError(400, "INVALID_STATE", "Week already released.");
  }

  await prisma.weekly_submission_tickets.deleteMany({ where: { weeklySubmissionId: submission.id } });
  await prisma.weekly_submission_tickets.createMany({
    data: ticketIds.map((blockFieldTicketId) => ({
      id: uuid("wst"),
      weeklySubmissionId: submission.id,
      blockFieldTicketId,
    })),
  });

  const updated = await prisma.weekly_submissions.update({
    where: { id: submission.id },
    data: { status: "submitted", submittedAt: new Date() },
    include: submissionInclude,
  });
  await auditCropfort.log(user.id, programId, "weekly_submission", updated.id, "submitted", submission, updated);
  return serializeSubmission(updated);
};

exports.validateWeek = async (user, weekEndingValue) => {
  const programId = requireProgramId(user);
  const weekEnding = parseWeekEnding(weekEndingValue);
  const submission = await prisma.weekly_submissions.findUnique({
    where: { programId_weekEnding: { programId, weekEnding } },
    include: submissionInclude,
  });
  if (!submission) throw new AppError(404, "NOT_FOUND", "Weekly submission not found.");
  if (submission.status === "pending") {
    throw new AppError(400, "INVALID_STATE", "Submit the week before running validation.");
  }

  const checks = await validationService.runChecks(programId, submission.id);
  const updated = await prisma.weekly_submissions.update({
    where: { id: submission.id },
    data: { status: "validated" },
    include: submissionInclude,
  });
  updated.checks = checks;
  await auditCropfort.log(user.id, programId, "weekly_submission", submission.id, "check_recorded", submission, updated);
  return serializeSubmission(updated);
};

exports.releaseWeek = async (user, weekEndingValue) => {
  const programId = requireProgramId(user);
  const weekEnding = parseWeekEnding(weekEndingValue);
  const submission = await prisma.weekly_submissions.findUnique({
    where: { programId_weekEnding: { programId, weekEnding } },
    include: submissionInclude,
  });
  if (!submission) throw new AppError(404, "NOT_FOUND", "Weekly submission not found.");
  if (submission.status !== "validated") {
    throw new AppError(400, "INVALID_STATE", "Run validation before release.");
  }

  const hardFailures = submission.checks.filter((c) => c.isHardBlock && c.result === "fail");
  if (hardFailures.length) {
    throw new AppError(422, "HARD_BLOCK", "Hard validation checks must pass before release.", {
      checks: hardFailures.map((c) => c.checkType),
    });
  }

  const ticketIds = submission.tickets.map((t) => t.blockFieldTicketId);
  const tickets = await prisma.block_field_tickets.findMany({ where: { id: { in: ticketIds } } });
  const notReviewed = tickets.filter(
    (t) => !["reviewed_approved", "reviewed_flagged"].includes(t.status),
  );
  if (notReviewed.length) {
    throw new AppError(422, "NOT_REVIEWED", "All tickets must be reviewed before release.", {
      ticketIds: notReviewed.map((t) => t.id),
    });
  }

  const now = new Date();
  await prisma.block_field_tickets.updateMany({
    where: { id: { in: ticketIds } },
    data: { status: "released", releasedAt: now },
  });

  const updated = await prisma.weekly_submissions.update({
    where: { id: submission.id },
    data: { status: "released", releasedAt: now },
    include: submissionInclude,
  });
  await auditCropfort.log(user.id, programId, "weekly_submission", submission.id, "released", submission, updated);
  return serializeSubmission(updated);
};

exports.getValidationQueue = async (user) => {
  const programId = requireProgramId(user);
  const submissions = await prisma.weekly_submissions.findMany({
    where: { programId, status: { in: ["submitted", "validated"] } },
    include: submissionInclude,
    orderBy: { weekEnding: "desc" },
  });
  return submissions.map(serializeSubmission);
};
