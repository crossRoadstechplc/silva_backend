const AppError = require("../../utils/AppError");

/**
 * Maker-checker: same user cannot validate/verify own submission,
 * and validator/verifier must be a different organization type than the submitter.
 */
async function assertMakerChecker({ actor, submitterUserId, prisma, actionLabel = "approve" }) {
  if (!submitterUserId) return;
  if (actor.id === submitterUserId) {
    throw new AppError(409, "MAKER_CHECKER_VIOLATION", `Actor cannot ${actionLabel} own submission.`);
  }
  const submitter = await prisma.users.findUnique({
    where: { id: submitterUserId },
    include: { organization: true },
  });
  if (!submitter) return;
  const submitterOrgType = submitter.organization?.type;
  if (submitterOrgType && actor.organizationType && submitterOrgType === actor.organizationType) {
    throw new AppError(
      409,
      "MAKER_CHECKER_VIOLATION",
      `${actionLabel} requires a different organization than the submitter.`,
    );
  }
}

module.exports = { assertMakerChecker };
