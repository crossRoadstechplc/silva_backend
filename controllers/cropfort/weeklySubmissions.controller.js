const catchAsync = require("../../utils/catchAsync");
const weeklySubmissionsService = require("../../services/cropfort/weeklySubmissions.service");

exports.list = catchAsync(async (req, res) => {
  const data = await weeklySubmissionsService.list(req.user, req.query);
  res.json({ data });
});

exports.getByWeek = catchAsync(async (req, res) => {
  const data = await weeklySubmissionsService.getByWeek(req.user, req.params.weekEnding);
  res.json({ data });
});

exports.submitWeek = catchAsync(async (req, res) => {
  const data = await weeklySubmissionsService.submitWeek(
    req.user,
    req.params.weekEnding,
    req.validatedBody.ticketIds,
  );
  res.json({ data });
});

exports.validateWeek = catchAsync(async (req, res) => {
  const data = await weeklySubmissionsService.validateWeek(req.user, req.params.weekEnding);
  res.json({ data });
});

exports.releaseWeek = catchAsync(async (req, res) => {
  const data = await weeklySubmissionsService.releaseWeek(req.user, req.params.weekEnding);
  res.json({ data });
});

exports.getValidationQueue = catchAsync(async (req, res) => {
  const data = await weeklySubmissionsService.getValidationQueue(req.user);
  res.json({ data });
});
