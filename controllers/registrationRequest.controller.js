const catchAsync = require("../utils/catchAsync");
const registrationRequest = require("../services/registrationRequest.service");

exports.submit = catchAsync(async (req, res) => {
  const data = await registrationRequest.submit(req.validatedBody);
  res.status(201).json({ data });
});

exports.list = catchAsync(async (req, res) => {
  const { items, meta } = await registrationRequest.findAll(req.query, req.user);
  res.json({ data: items, meta });
});

exports.findOne = catchAsync(async (req, res) => {
  const data = await registrationRequest.findOne(req.params.id, req.user);
  res.json({ data });
});

exports.markUnderReview = catchAsync(async (req, res) => {
  const data = await registrationRequest.markUnderReview(req.params.id, req.user, req.validatedBody.notes);
  res.json({ data });
});

exports.approve = catchAsync(async (req, res) => {
  const data = await registrationRequest.approve(req.params.id, req.user, req.validatedBody.notes);
  res.json({ data });
});

exports.reject = catchAsync(async (req, res) => {
  const data = await registrationRequest.reject(req.params.id, req.user, req.validatedBody.notes);
  res.json({ data });
});

exports.activate = catchAsync(async (req, res) => {
  const data = await registrationRequest.activate(req.validatedBody);
  res.json({ data });
});

exports.checkActivation = catchAsync(async (req, res) => {
  if (!req.query.token) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "token query param is required." } });
  }
  const data = await registrationRequest.checkActivation(req.query.token);
  res.json({ data });
});
