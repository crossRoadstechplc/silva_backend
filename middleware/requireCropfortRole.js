const AppError = require("../utils/AppError");
const { hasCropfortRole } = require("../utils/cropfortRoles");

module.exports = function requireCropfortRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const programId = req.user?.activeProgramId;
      if (!programId) {
        return next(new AppError(400, "PROGRAM_REQUIRED", "Active program required."));
      }
      const ok = await hasCropfortRole(req.user.id, programId, allowedRoles);
      if (!ok) {
        return next(new AppError(403, "FORBIDDEN", "Insufficient Cropfort role for this action."));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
};
