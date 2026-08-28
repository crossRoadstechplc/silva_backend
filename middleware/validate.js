const AppError = require("../utils/AppError");

module.exports = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      const details = issues.map((err) => ({
        field: err.path.join("."),
        issue: err.message,
      }));
      return next(new AppError(400, "VALIDATION_ERROR", "Request failed validation.", details));
    }

    // Always keep the full parsed object — never pick a top-level `body` field (message text).
    req.validatedBody = result.data;
    if (typeof result.data === "object" && result.data !== null && !Array.isArray(result.data)) {
      req.body = { ...req.body, ...result.data };
    }
    next();
  };
};
