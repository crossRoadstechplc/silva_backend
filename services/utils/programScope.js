const AppError = require("../../utils/AppError");

function requireProgramId(user) {
  const programId = user?.activeProgramId;
  if (!programId) {
    throw new AppError(400, "PROGRAM_REQUIRED", "Select an active program before continuing.");
  }
  return programId;
}

/** Merge program scope into a Prisma where clause. */
function scopedWhere(user, extra = {}) {
  return { programId: requireProgramId(user), ...extra };
}

function programCreateData(user, data = {}) {
  return { programId: requireProgramId(user), ...data };
}

module.exports = { requireProgramId, scopedWhere, programCreateData };
