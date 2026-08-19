const AppError = require("../utils/AppError");

module.exports = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, "FORBIDDEN", "Insufficient permissions"));
    }
    next();
  };
};
