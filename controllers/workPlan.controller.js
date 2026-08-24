const catchAsync = require("../utils/catchAsync");
const workPlanSubmission = require("../services/workPlanSubmission.service");

exports.list = catchAsync(async (req, res) => {
  const data = await workPlanSubmission.findAll(req.query, req.user);
  res.json({ data });
});

exports.template = catchAsync(async (_req, res) => {
  const workPlanImport = require("../services/workPlanImport.service");
  res.json({ data: workPlanImport.getTemplate() });
});

exports.findOne = catchAsync(async (req, res) => {
  const data = await workPlanSubmission.findOne(req.params.id, req.user);
  res.json({ data });
});

exports.create = catchAsync(async (req, res) => {
  const data = await workPlanSubmission.create(req.body, req.user);
  res.status(201).json({ data });
});

exports.update = catchAsync(async (req, res) => {
  const data = await workPlanSubmission.update(req.params.id, req.body, req.user);
  res.json({ data });
});

exports.updateParsed = catchAsync(async (req, res) => {
  const data = await workPlanSubmission.updateParsed(req.params.id, req.body.parsedJson, req.user);
  res.json({ data });
});

exports.upload = catchAsync(async (req, res) => {
  const buffer = req.body;
  if (!buffer || !buffer.length) {
    return res.status(400).json({ error: { code: "INVALID_BODY", message: "Upload body required." } });
  }
  const data = await workPlanSubmission.uploadExcel(req.params.id, buffer, req.user);
  res.json({ data });
});

exports.submit = catchAsync(async (req, res) => {
  const data = await workPlanSubmission.submit(req.params.id, req.user);
  res.json({ data });
});

exports.requestRevision = catchAsync(async (req, res) => {
  const data = await workPlanSubmission.requestRevision(req.params.id, req.body?.notes, req.user);
  res.json({ data });
});

exports.reject = catchAsync(async (req, res) => {
  const data = await workPlanSubmission.reject(req.params.id, req.body?.notes, req.user);
  res.json({ data });
});

exports.accept = catchAsync(async (req, res) => {
  const data = await workPlanSubmission.accept(req.params.id, req.user, req.body);
  res.json({ data });
});

exports.afpSchedule = catchAsync(async (req, res) => {
  const data = await workPlanSubmission.getAfpSchedule(req.params.afpLineId, req.user);
  res.json({ data });
});
