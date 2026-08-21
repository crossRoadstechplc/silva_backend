const catchAsync = require("../utils/catchAsync");
const vendorService = require("../services/vendor.service");
const dashboardService = require("../services/dashboard.service");
const platformService = require("../services/platform.service");

exports.findAllVendors = catchAsync(async (req, res) => {
  const { items, meta } = await vendorService.findAll(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createVendor = catchAsync(async (req, res) => {
  const data = await vendorService.create(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findOneVendor = catchAsync(async (req, res) => {
  const data = await vendorService.findOne(req.params.vendorId, req.user);
  res.json({ data });
});
exports.updateVendor = catchAsync(async (req, res) => {
  const data = await vendorService.update(req.params.vendorId, req.body, req.user);
  res.json({ data });
});
exports.activateVendor = catchAsync(async (req, res) => {
  const data = await vendorService.activate(req.params.vendorId);
  res.json({ data });
});
exports.deactivateVendor = catchAsync(async (req, res) => {
  const data = await vendorService.deactivate(req.params.vendorId, req.body?.status || "terminated");
  res.json({ data });
});
exports.vendorUsers = catchAsync(async (req, res) => {
  const { items, meta } = await vendorService.listUsers(req.params.vendorId, req.user, req.query);
  res.json({ data: items, meta });
});
exports.vendorInvite = catchAsync(async (req, res) => {
  const data = await vendorService.inviteUser(req.params.vendorId, req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.listContracts = catchAsync(async (req, res) => {
  const { items, meta } = await vendorService.listContracts(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createContract = catchAsync(async (req, res) => {
  const data = await vendorService.createContract(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findContract = catchAsync(async (req, res) => {
  const data = await vendorService.findContract(req.params.contractId, req.user);
  res.json({ data });
});
exports.updateContract = catchAsync(async (req, res) => {
  const data = await vendorService.updateContract(req.params.contractId, req.body, req.user);
  res.json({ data });
});
exports.listScorecards = catchAsync(async (req, res) => {
  const { items, meta } = await vendorService.listScorecards(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createScorecard = catchAsync(async (req, res) => {
  const data = await vendorService.createScorecard(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findScorecard = catchAsync(async (req, res) => {
  const data = await vendorService.findScorecard(req.params.scorecardId, req.user);
  res.json({ data });
});
exports.updateScorecard = catchAsync(async (req, res) => {
  const data = await vendorService.updateScorecard(req.params.scorecardId, req.body, req.user);
  res.json({ data });
});

exports.silvaOwner = catchAsync(async (req, res) => {
  const data = await dashboardService.silvaOwner(req.user, req.query);
  res.json({ data });
});
exports.spxManagement = catchAsync(async (req, res) => {
  const data = await dashboardService.spxManagement(req.user, req.query);
  res.json({ data });
});
exports.vendorField = catchAsync(async (req, res) => {
  const data = await dashboardService.vendorField(req.user);
  res.json({ data });
});
exports.dashboardNotifications = catchAsync(async (req, res) => {
  const { items, meta } = await dashboardService.notifications(req.user, req.query);
  res.json({ data: items, meta });
});

exports.listRevenue = catchAsync(async (req, res) => {
  const { items, meta } = await platformService.listRevenue(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createRevenue = catchAsync(async (req, res) => {
  const data = await platformService.createRevenue(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findRevenue = catchAsync(async (req, res) => {
  const data = await platformService.findRevenue(req.params.entryId, req.user);
  res.json({ data });
});
exports.updateRevenue = catchAsync(async (req, res) => {
  const data = await platformService.updateRevenue(req.params.entryId, req.body, req.user);
  res.json({ data });
});
exports.exportRevenue = catchAsync(async (req, res) => {
  const data = await platformService.exportRevenue(req.params.entryId, req.user);
  res.json({ data });
});
exports.bva = catchAsync(async (req, res) => {
  const { items, meta } = await platformService.budgetVsActual(req.query, req.user);
  res.json({ data: items, meta });
});
exports.bvaSummary = catchAsync(async (req, res) => {
  const data = await platformService.budgetSummary(req.query, req.user);
  res.json({ data });
});
exports.bvaConfig = catchAsync(async (req, res) => {
  const data = await platformService.patchBudgetConfig(req.body, req.user);
  res.json({ data });
});
exports.listReports = catchAsync(async (req, res) => {
  const { items, meta } = await platformService.listReports(req.query, req.user);
  res.json({ data: items, meta });
});
exports.generateWeekly = catchAsync(async (req, res) => {
  const data = await platformService.generateReport("weekly", req.body || {}, req.user);
  res.status(201).json({ data });
});
exports.generateMonthly = catchAsync(async (req, res) => {
  const data = await platformService.generateReport("monthly", req.body || {}, req.user);
  res.status(201).json({ data });
});
exports.generateQuarterly = catchAsync(async (req, res) => {
  const data = await platformService.generateReport("quarterly", req.body || {}, req.user);
  res.status(201).json({ data });
});
exports.generateAnnual = catchAsync(async (req, res) => {
  const data = await platformService.generateReport("annual", req.body || {}, req.user);
  res.status(201).json({ data });
});
exports.findReport = catchAsync(async (req, res) => {
  const data = await platformService.findReport(req.params.reportId, req.user);
  res.json({ data });
});
exports.patchNarrative = catchAsync(async (req, res) => {
  const data = await platformService.patchNarrative(req.params.reportId, req.body.narrative, req.user);
  res.json({ data });
});
exports.releaseReport = catchAsync(async (req, res) => {
  const data = await platformService.releaseReport(req.params.reportId, req.user);
  res.json({ data });
});
exports.listNotifications = catchAsync(async (req, res) => {
  const { items, meta } = await platformService.listNotifications(req.user, req.query);
  res.json({ data: items, meta });
});
exports.ackNotification = catchAsync(async (req, res) => {
  const data = await platformService.acknowledgeNotification(req.params.notificationId, req.user);
  res.json({ data });
});
exports.listAudit = catchAsync(async (req, res) => {
  const { items, meta } = await platformService.listAudit(req.query, req.user);
  res.json({ data: items, meta });
});
exports.findAudit = catchAsync(async (req, res) => {
  const data = await platformService.findAudit(req.params.auditId, req.user);
  res.json({ data });
});
exports.listDisclosures = catchAsync(async (req, res) => {
  const { items, meta } = await platformService.listDisclosures(req.query, req.user);
  res.json({ data: items, meta });
});
exports.createDisclosure = catchAsync(async (req, res) => {
  const data = await platformService.createDisclosure(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.patchDisclosure = catchAsync(async (req, res) => {
  const data = await platformService.patchDisclosure(req.params.disclosureId, req.body, req.user);
  res.json({ data });
});
exports.listAccountability = catchAsync(async (req, res) => {
  const data = await platformService.listAccountability(req.user);
  res.json({ data });
});
exports.patchAccountability = catchAsync(async (req, res) => {
  const data = await platformService.patchAccountability(req.params.operatingDiscipline, req.body, req.user);
  res.json({ data });
});
exports.listSchedule3 = catchAsync(async (req, res) => {
  const data = await platformService.listSchedule3(req.user);
  res.json({ data });
});
exports.patchSchedule3 = catchAsync(async (req, res) => {
  const data = await platformService.patchSchedule3(req.params.band, req.body, req.user);
  res.json({ data });
});
exports.listSchedule4 = catchAsync(async (req, res) => {
  const data = await platformService.listSchedule4(req.user);
  res.json({ data });
});
exports.patchSchedule4 = catchAsync(async (req, res) => {
  const data = await platformService.patchSchedule4(req.params.ruleId, req.body, req.user);
  res.json({ data });
});
exports.listCoa = catchAsync(async (req, res) => {
  const data = await platformService.listCoa(req.user);
  res.json({ data });
});
exports.createCoa = catchAsync(async (req, res) => {
  const data = await platformService.createCoa(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.patchCoa = catchAsync(async (req, res) => {
  const data = await platformService.patchCoa(req.params.mappingId, req.body, req.user);
  res.json({ data });
});
exports.listGl = catchAsync(async (req, res) => {
  const data = await platformService.listGlExports(req.user);
  res.json({ data });
});
exports.generateGl = catchAsync(async (req, res) => {
  const data = await platformService.generateGlExport(req.body, req.user);
  res.status(201).json({ data });
});
exports.findGl = catchAsync(async (req, res) => {
  const data = await platformService.findGlExport(req.params.exportId, req.user, req.restrictedExport);
  res.json({ data });
});
exports.uploadUrl = catchAsync(async (req, res) => {
  const data = await platformService.uploadUrl(req.validatedBody, req.user);
  res.json({ data });
});
exports.createAttachment = catchAsync(async (req, res) => {
  const data = await platformService.createAttachment(req.validatedBody, req.user);
  res.status(201).json({ data });
});
exports.findAttachment = catchAsync(async (req, res) => {
  const data = await platformService.findAttachment(req.params.attachmentId, req.user);
  res.json({ data });
});
exports.deleteAttachment = catchAsync(async (req, res) => {
  await platformService.deleteAttachment(req.params.attachmentId, req.user);
  res.json({ data: { ok: true } });
});
