const catchAsync = require("../../utils/catchAsync");
const afpBlockLinesService = require("../../services/cropfort/afpBlockLines.service");

exports.list = catchAsync(async (req, res) => {
  const data = await afpBlockLinesService.list(req.user, req.query);
  res.json({ data });
});

exports.create = catchAsync(async (req, res) => {
  const data = await afpBlockLinesService.create(req.user, req.validatedBody);
  res.status(201).json({ data });
});

exports.update = catchAsync(async (req, res) => {
  const data = await afpBlockLinesService.update(req.user, req.params.lineId, req.validatedBody);
  res.json({ data });
});

exports.updateElection = catchAsync(async (req, res) => {
  const data = await afpBlockLinesService.updateElection(
    req.user,
    req.params.lineId,
    req.validatedBody.electionStatus,
  );
  res.json({ data });
});

exports.submit = catchAsync(async (req, res) => {
  const data = await afpBlockLinesService.submit(req.user, req.validatedBody.lineIds);
  res.json({ data });
});

exports.approveLine = catchAsync(async (req, res) => {
  const data = await afpBlockLinesService.approveLine(req.user, req.params.lineId, req.validatedBody.comment);
  res.json({ data });
});

exports.returnLine = catchAsync(async (req, res) => {
  const data = await afpBlockLinesService.returnLine(req.user, req.params.lineId, req.validatedBody.comment);
  res.json({ data });
});

exports.reopenLine = catchAsync(async (req, res) => {
  const data = await afpBlockLinesService.reopenLine(req.user, req.params.lineId);
  res.json({ data });
});
