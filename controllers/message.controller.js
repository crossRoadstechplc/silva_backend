const catchAsync = require("../utils/catchAsync");
const messageService = require("../services/message.service");

exports.listCounterparties = catchAsync(async (req, res) => {
  const data = await messageService.listCounterparties(req.query, req.user);
  res.json({ data });
});

exports.listThreads = catchAsync(async (req, res) => {
  const data = await messageService.listThreads(req.query, req.user);
  res.json({ data });
});

exports.createThread = catchAsync(async (req, res) => {
  const data = await messageService.createThread(req.validatedBody, req.user);
  res.status(201).json({ data });
});

exports.getThread = catchAsync(async (req, res) => {
  const data = await messageService.getThread(req.params.threadId, req.user);
  res.json({ data });
});

exports.reply = catchAsync(async (req, res) => {
  const data = await messageService.reply(req.params.threadId, req.validatedBody, req.user);
  res.status(201).json({ data });
});

exports.markRead = catchAsync(async (req, res) => {
  const data = await messageService.markRead(req.params.threadId, req.user);
  res.json({ data });
});

exports.patchThread = catchAsync(async (req, res) => {
  const data = await messageService.patchThread(req.params.threadId, req.validatedBody, req.user);
  res.json({ data });
});
