const AppError = require("../utils/AppError");

module.exports = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid JSON body.", details: [] },
      requestId: req.requestId,
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details || [],
      },
      requestId: req.requestId,
    });
  }

  if (err && err.code === "P2002") {
    return res.status(409).json({
      error: { code: "CONFLICT", message: "Duplicate or unique constraint.", details: [] },
      requestId: req.requestId,
    });
  }

  if (err && err.code === "P2025") {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Resource not found.", details: [] },
      requestId: req.requestId,
    });
  }

  if (err && err.code === "P1001") {
    return res.status(503).json({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database is temporarily unreachable. Check Supabase project status and retry.",
        details: [],
      },
      requestId: req.requestId,
    });
  }

  console.error("Error:", err);
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      details: [],
    },
    requestId: req.requestId,
  });
};
