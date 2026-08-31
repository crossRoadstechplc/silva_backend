const catchAsync = require("../../utils/catchAsync");
const budgetService = require("../../services/cropfort/budget.service");

exports.preview = catchAsync(async (req, res) => {
  const data = await budgetService.preview(req.user, req.query);
  res.json({ data });
});
