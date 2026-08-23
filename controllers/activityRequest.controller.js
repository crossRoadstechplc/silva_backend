const catchAsync = require("../utils/catchAsync");
const activityRequestService = require("../services/activityRequest.service");

exports.create = catchAsync(async (req, res) => {
  const data = await activityRequestService.create(req.validatedBody, req.user);
  res.status(201).json({ data });
});

exports.findAll = catchAsync(async (req, res) => {
  const { items, meta } = await activityRequestService.findAll(req.query, req.user);
  res.json({ data: items, meta });
});

exports.findOne = catchAsync(async (req, res) => {
  const data = await activityRequestService.findOne(req.params.requestId, req.user);
  res.json({ data });
});

exports.convert = catchAsync(async (req, res) => {
  const data = await activityRequestService.convert(req.params.requestId, req.validatedBody, req.user);
  res.json({ data });
});

exports.dismiss = catchAsync(async (req, res) => {
  const data = await activityRequestService.dismiss(req.params.requestId, req.validatedBody.reason, req.user);
  res.json({ data });
});
