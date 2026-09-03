const catchAsync = require("../../utils/catchAsync");
const budgetService = require("../../services/cropfort/budget.service");
const budgetEstimateService = require("../../services/cropfort/budgetEstimate.service");

exports.preview = catchAsync(async (req, res) => {
  const data = await budgetService.preview(req.user, req.query);
  res.json({ data });
});

exports.estimate = catchAsync(async (req, res) => {
  const data = await budgetEstimateService.estimate(req.user, req.validatedBody);
  res.json({ data });
});
