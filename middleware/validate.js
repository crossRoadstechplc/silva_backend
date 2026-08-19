const AppError = require("../utils/AppError");

module.exports = (schema) => {
  return (req, res, next) => {
    const payload = schema._def?.shape?.body ? { body: req.body, query: req.query, params: req.params } : req.body;
    const result = schema.safeParse(payload);

    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      const details = issues.map((err) => ({
        field: err.path.filter((p) => p !== "body" && p !== "query" && p !== "params").join(".") || err.path.join("."),
        issue: err.message,
      }));
      return next(new AppError(400, "VALIDATION_ERROR", "Request failed validation.", details));
    }

    req.validatedBody = result.data.body !== undefined ? result.data.body : result.data;
    if (req.validatedBody && typeof req.validatedBody === "object" && !Array.isArray(req.validatedBody)) {
      req.body = { ...req.body, ...req.validatedBody };
    }
    next();
  };
};
