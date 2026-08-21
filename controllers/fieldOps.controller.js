const ifsFormService = require("../services/ifsForm.service");
const seasonCalendarService = require("../services/seasonCalendar.service");
const catchAsync = require("../utils/catchAsync");

exports.ifsCatalog = catchAsync(async (req, res) => {
  const data = await ifsFormService.catalog(req.user);
  res.json({ data });
});
exports.ifsFindAll = catchAsync(async (req, res) => {
  const { items, meta } = await ifsFormService.findAll(req.query, req.user);
  res.json({ data: items, meta });
});
exports.ifsFindOne = catchAsync(async (req, res) => {
  const data = await ifsFormService.findById(req.params.formId, req.user);
  res.json({ data });
});
exports.ifsCreate = catchAsync(async (req, res) => {
  const data = await ifsFormService.create(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.ifsUpdate = catchAsync(async (req, res) => {
  const data = await ifsFormService.update(req.params.formId, req.body, req.user);
  res.json({ data });
});
exports.ifsSubmit = catchAsync(async (req, res) => {
  const data = await ifsFormService.submit(req.params.formId, req.user);
  res.json({ data });
});
exports.ifsValidate = catchAsync(async (req, res) => {
  const data = await ifsFormService.validate(req.params.formId, req.user);
  res.json({ data });
});
exports.ifsReject = catchAsync(async (req, res) => {
  const data = await ifsFormService.reject(req.params.formId, req.validatedBody.reason, req.user);
  res.json({ data });
});

exports.calFindAll = catchAsync(async (req, res) => {
  const { items, meta } = await seasonCalendarService.findAllCalendars(req.query, req.user);
  res.json({ data: items, meta });
});
exports.calFindOne = catchAsync(async (req, res) => {
  const data = await seasonCalendarService.findCalendar(req.params.calendarId, req.user);
  res.json({ data });
});
exports.calCreate = catchAsync(async (req, res) => {
  const data = await seasonCalendarService.createCalendar(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.calUpdate = catchAsync(async (req, res) => {
  const data = await seasonCalendarService.updateCalendar(req.params.calendarId, req.body, req.user);
  res.json({ data });
});
exports.calAddWindow = catchAsync(async (req, res) => {
  const data = await seasonCalendarService.addWindow(req.params.calendarId, req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.calUpdateWindow = catchAsync(async (req, res) => {
  const data = await seasonCalendarService.updateWindow(req.params.windowId, req.body, req.user);
  res.json({ data });
});
exports.calIssueWindow = catchAsync(async (req, res) => {
  const data = await seasonCalendarService.issueWindow(req.params.windowId, req.user);
  res.json({ data });
});
exports.calStartWindow = catchAsync(async (req, res) => {
  const data = await seasonCalendarService.startWindow(req.params.windowId, req.user);
  res.json({ data });
});
exports.calCompleteWindow = catchAsync(async (req, res) => {
  const data = await seasonCalendarService.completeWindow(req.params.windowId, req.body, req.user);
  res.json({ data });
});
