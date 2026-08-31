const catchAsync = require("../../utils/catchAsync");
const blockFieldTicketsService = require("../../services/cropfort/blockFieldTickets.service");

exports.list = catchAsync(async (req, res) => {
  const data = await blockFieldTicketsService.list(req.user, req.query);
  res.json({ data });
});

exports.create = catchAsync(async (req, res) => {
  const data = await blockFieldTicketsService.create(req.user, req.validatedBody);
  res.status(201).json({ data });
});

exports.update = catchAsync(async (req, res) => {
  const data = await blockFieldTicketsService.update(req.user, req.params.ticketId, req.validatedBody);
  res.json({ data });
});

exports.submit = catchAsync(async (req, res) => {
  const data = await blockFieldTicketsService.submit(req.user, req.params.ticketId);
  res.json({ data });
});

exports.review = catchAsync(async (req, res) => {
  const data = await blockFieldTicketsService.review(req.user, req.params.ticketId, req.validatedBody);
  res.json({ data });
});

exports.createCorrection = catchAsync(async (req, res) => {
  const data = await blockFieldTicketsService.createCorrection(req.user, req.params.ticketId, req.validatedBody);
  res.status(201).json({ data });
});

exports.sync = catchAsync(async (req, res) => {
  const data = await blockFieldTicketsService.sync(req.user, req.validatedBody);
  res.json({ data });
});

exports.uploadPhoto = catchAsync(async (req, res) => {
  const data = await blockFieldTicketsService.uploadPhoto(req.user, req.validatedBody);
  res.status(201).json({ data });
});
