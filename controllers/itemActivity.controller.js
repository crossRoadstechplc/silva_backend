const catchAsync = require("../utils/catchAsync");
const itemActivityService = require("../services/itemActivity.service");

exports.listActivity = catchAsync(async (req, res) => {
  const { entityType, entityId } = req.params;
  const items = await itemActivityService.listActivity(entityType, entityId, req.user);
  res.json({ data: items });
});

exports.createComment = catchAsync(async (req, res) => {
  const { entityType, entityId } = req.params;
  const item = await itemActivityService.createComment(entityType, entityId, req.body, req.user);
  res.status(201).json({ data: item });
});
