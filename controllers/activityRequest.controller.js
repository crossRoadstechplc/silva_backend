const catchAsync = require("../utils/catchAsync");
const activityRequest = require("../services/activityRequest.service");

exports.findAll = catchAsync(async (req, res) => {
  const { items, meta } = await activityRequest.findAll(req.query, req.user);
  res.json({ data: items, meta });
});

exports.findOne = catchAsync(async (req, res) => {
  const data = await activityRequest.findOne(req.params.id, req.user);
  res.json({ data });
});

exports.create = catchAsync(async (req, res) => {
  const data = await activityRequest.create(req.validatedBody, req.user);
  res.status(201).json({ data });
});

exports.convert = catchAsync(async (req, res) => {
  const data = await activityRequest.convert(req.params.id, req.validatedBody, req.user);
  res.json({ data });
});

exports.dismiss = catchAsync(async (req, res) => {
  const data = await activityRequest.dismiss(req.params.id, req.validatedBody, req.user);
  res.json({ data });
});

exports.workListOptions = catchAsync(async (req, res) => {
  const data = await activityRequest.workListOptions(req.user);
  res.json({ data });
});
