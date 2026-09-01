const rateLimit = require("express-rate-limit");
const env = require("../config/env");
const AppError = require("../utils/AppError");

module.exports = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.NODE_ENV === "test" ? 1000 : env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: (req, res, next) => next(new AppError(429, "RATE_LIMITED", "Auth or export throttled.")),
});
