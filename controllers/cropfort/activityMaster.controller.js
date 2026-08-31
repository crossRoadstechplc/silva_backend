const catchAsync = require("../../utils/catchAsync");
const activityMasterService = require("../../services/cropfort/activityMaster.service");

exports.listTemplates = catchAsync(async (_req, res) => {
  const data = await activityMasterService.listTemplates();
  res.json({ data });
});

exports.list = catchAsync(async (req, res) => {
  const data = await activityMasterService.list(req.user);
  res.json({ data });
});

exports.create = catchAsync(async (req, res) => {
  const data = await activityMasterService.create(req.user, req.validatedBody);
  res.status(201).json({ data });
});

exports.update = catchAsync(async (req, res) => {
  const data = await activityMasterService.update(req.user, req.params.activityId, req.validatedBody);
  res.json({ data });
});
