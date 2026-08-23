const catchAsync = require("../utils/catchAsync");
const afpService = require("../services/afp.service");
const afeService = require("../services/afe.service");

exports.findAllAfp = catchAsync(async (req, res) => {
  const { items, meta } = await afpService.findAll(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createAfp = catchAsync(async (req, res) => {
  const data = await afpService.create(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findOneAfp = catchAsync(async (req, res) => {
  const data = await afpService.findOne(req.params.afpLineId, req.user);
  res.json({ data });
});
exports.updateAfp = catchAsync(async (req, res) => {
  const data = await afpService.update(req.params.afpLineId, req.body, req.user);
  res.json({ data });
});
exports.submitAfp = catchAsync(async (req, res) => {
  const data = await afpService.submit(req.params.afpLineId, req.user, req.body?.comment);
  res.json({ data });
});
exports.approveAfp = catchAsync(async (req, res) => {
  const data = await afpService.approve(req.params.afpLineId, req.user);
  res.json({ data });
});
exports.closeAfp = catchAsync(async (req, res) => {
  const data = await afpService.close(req.params.afpLineId, req.user);
  res.json({ data });
});

exports.findAllAfe = catchAsync(async (req, res) => {
  const { items, meta } = await afeService.findAll(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createAfe = catchAsync(async (req, res) => {
  const data = await afeService.create(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findOneAfe = catchAsync(async (req, res) => {
  const data = await afeService.findOne(req.params.afeId, req.user);
  res.json({ data });
});
exports.updateAfe = catchAsync(async (req, res) => {
  const data = await afeService.update(req.params.afeId, req.body, req.user);
  res.json({ data });
});
exports.submitAfe = catchAsync(async (req, res) => {
  const data = await afeService.submit(req.params.afeId, req.user);
  res.json({ data });
});
exports.validateAfe = catchAsync(async (req, res) => {
  const data = await afeService.validate(req.params.afeId, req.user);
  res.json({ data });
});
exports.approveAfe = catchAsync(async (req, res) => {
  const data = await afeService.approve(req.params.afeId, req.user);
  res.json({ data });
});
exports.rejectAfe = catchAsync(async (req, res) => {
  const data = await afeService.reject(req.params.afeId, req.body.reason, req.user);
  res.json({ data });
});
exports.closeAfe = catchAsync(async (req, res) => {
  const data = await afeService.close(req.params.afeId, req.user);
  res.json({ data });
});
exports.afeHistory = catchAsync(async (req, res) => {
  const data = await afeService.getHistory(req.params.afeId, req.user);
  res.json({ data });
});
exports.listIntakeVendorAfes = catchAsync(async (req, res) => {
  const { items, meta } = await afeService.listIntakeVendorAfes(req.query, req.user);
  res.json({ data: items, meta });
});
