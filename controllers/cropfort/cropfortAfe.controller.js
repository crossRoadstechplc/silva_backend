const catchAsync = require("../../utils/catchAsync");
const cropfortAfeService = require("../../services/cropfort/cropfortAfe.service");

exports.list = catchAsync(async (req, res) => {
  const data = await cropfortAfeService.list(req.user, req.query);
  res.json({ data });
});

exports.create = catchAsync(async (req, res) => {
  const data = await cropfortAfeService.create(req.user, req.validatedBody);
  res.status(201).json({ data });
});

exports.update = catchAsync(async (req, res) => {
  const data = await cropfortAfeService.update(req.user, req.params.afeId, req.validatedBody);
  res.json({ data });
});

exports.submit = catchAsync(async (req, res) => {
  const data = await cropfortAfeService.submit(req.user, req.validatedBody.afeIds);
  res.json({ data });
});

exports.approve = catchAsync(async (req, res) => {
  const data = await cropfortAfeService.approve(req.user, req.params.afeId, req.validatedBody.comment);
  res.json({ data });
});

exports.returnAfe = catchAsync(async (req, res) => {
  const data = await cropfortAfeService.returnAfe(req.user, req.params.afeId, req.validatedBody.comment);
  res.json({ data });
});

exports.previewBand = catchAsync(async (req, res) => {
  const amountEtb = Number(req.query.amountEtb);
  const data = await cropfortAfeService.previewBand(req.user, amountEtb);
  res.json({ data });
});
