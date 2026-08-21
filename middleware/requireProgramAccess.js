const prisma = require("../config/database");
const AppError = require("../utils/AppError");

/**
 * Ensures the caller's org is a member of req.user.activeProgramId.
 * Skip if no active program (signup/onboarding) — domain services will still require programId.
 */
module.exports = async function requireProgramAccess(req, res, next) {
  try {
    const programId = req.user?.activeProgramId;
    if (!programId) return next();
    const membership = await prisma.program_memberships.findUnique({
      where: {
        programId_organizationId: {
          programId,
          organizationId: req.user.organizationId,
        },
      },
    });
    if (!membership) {
      return next(new AppError(403, "FORBIDDEN", "Your organization is not a member of the active program."));
    }
    req.programMembership = membership;
    return next();
  } catch (err) {
    return next(err);
  }
};
