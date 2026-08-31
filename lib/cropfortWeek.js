const AppError = require("../utils/AppError");

function parseWeekEnding(value) {
  if (!value) throw new AppError(400, "VALIDATION_ERROR", "weekEnding is required.");
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid weekEnding date.");
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = { parseWeekEnding, toDateString };
