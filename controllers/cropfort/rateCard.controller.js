const catchAsync = require("../../utils/catchAsync");
const rateCardService = require("../../services/cropfort/rateCard.service");

exports.list = catchAsync(async (req, res) => {
  const data = await rateCardService.list(req.user, req.query);
  res.json({ data });
});

exports.create = catchAsync(async (req, res) => {
  const data = await rateCardService.create(req.user, req.validatedBody);
  res.status(201).json({ data });
});

exports.update = catchAsync(async (req, res) => {
  const data = await rateCardService.update(req.user, req.params.lineId, req.validatedBody);
  res.json({ data });
});

exports.submit = catchAsync(async (req, res) => {
  const data = await rateCardService.submit(req.user, req.validatedBody.lineIds);
  res.json({ data });
});

exports.approveLine = catchAsync(async (req, res) => {
  const data = await rateCardService.approveLine(req.user, req.params.lineId, req.validatedBody.comment);
  res.json({ data });
});

exports.returnLine = catchAsync(async (req, res) => {
  const data = await rateCardService.returnLine(req.user, req.params.lineId, req.validatedBody.comment);
  res.json({ data });
});

exports.reopenLine = catchAsync(async (req, res) => {
  const data = await rateCardService.reopenLine(req.user, req.params.lineId);
  res.json({ data });
});
