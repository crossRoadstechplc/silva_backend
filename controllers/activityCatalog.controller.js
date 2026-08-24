const catchAsync = require("../utils/catchAsync");
const activityCatalogService = require("../services/activityCatalog.service");

exports.list = catchAsync(async (req, res) => {
  const items = await activityCatalogService.list(req.query, req.user);
  res.json({ data: items });
});

exports.findOne = catchAsync(async (req, res) => {
  const item = await activityCatalogService.findOne(req.params.activityId, req.user);
  res.json({ data: item });
});

exports.summaryByAfp = catchAsync(async (req, res) => {
  const summary = await activityCatalogService.sectionSummary(req.params.afpLineId, req.user);
  res.json({ data: summary });
});
