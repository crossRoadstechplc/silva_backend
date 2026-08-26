const catchAsync = require("../utils/catchAsync");
const adHocRequest = require("../services/adHocRequest.service");

exports.list = catchAsync(async (req, res) => {
  const { items, meta } = await adHocRequest.findAll(req.query, req.user);
  res.json({ data: items, meta });
});

exports.findOne = catchAsync(async (req, res) => {
  const data = await adHocRequest.findOne(req.params.id, req.user);
  res.json({ data });
});

exports.create = catchAsync(async (req, res) => {
  const data = await adHocRequest.create(req.validatedBody || req.body, req.user);
  res.status(201).json({ data });
});

exports.update = catchAsync(async (req, res) => {
  const data = await adHocRequest.update(req.params.id, req.validatedBody || req.body, req.user);
  res.json({ data });
});

exports.submit = catchAsync(async (req, res) => {
  const data = await adHocRequest.submit(req.params.id, req.user);
  res.json({ data });
});

exports.dismiss = catchAsync(async (req, res) => {
  const data = await adHocRequest.dismiss(req.params.id, req.body?.notes || req.body?.reason, req.user);
  res.json({ data });
});

exports.convert = catchAsync(async (req, res) => {
  const data = await adHocRequest.convertToAfe(req.params.id, req.validatedBody || req.body, req.user);
  res.json({ data });
});
