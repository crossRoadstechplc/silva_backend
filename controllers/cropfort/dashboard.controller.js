const catchAsync = require("../../utils/catchAsync");
const dashboardService = require("../../services/cropfort/dashboard.service");

exports.getDashboard = catchAsync(async (req, res) => {
  const data = await dashboardService.getDashboard(req.user, req.query);
  res.json({ data });
});
