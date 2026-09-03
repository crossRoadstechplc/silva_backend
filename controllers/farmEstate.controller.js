const catchAsync = require("../utils/catchAsync");
const farmEstate = require("../services/farmEstate.service");

exports.list = catchAsync(async (req, res) => {
  const data = await farmEstate.findAll(req.query, req.user);
  res.json({ data });
});

exports.findOne = catchAsync(async (req, res) => {
  const data = await farmEstate.findOne(req.params.id, req.user);
  res.json({ data });
});

exports.create = catchAsync(async (req, res) => {
  const data = await farmEstate.create(req.body, req.user);
  res.status(201).json({ data });
});

exports.update = catchAsync(async (req, res) => {
  const data = await farmEstate.update(req.params.id, req.body, req.user);
  res.json({ data });
});

exports.setVendors = catchAsync(async (req, res) => {
  const data = await farmEstate.setVendors(req.params.id, req.body.vendorIds || [], req.user);
  res.json({ data });
});

exports.addBlock = catchAsync(async (req, res) => {
  const data = await farmEstate.addBlock(req.params.id, req.body, req.user);
  res.status(201).json({ data });
});

exports.updateBlock = catchAsync(async (req, res) => {
  const data = await farmEstate.updateBlock(
    req.params.id,
    req.params.blockId,
    req.body,
    req.user,
  );
  res.json({ data });
});

exports.removeBlock = catchAsync(async (req, res) => {
  const data = await farmEstate.removeBlock(req.params.id, req.params.blockId, req.user);
  res.json({ data });
});
