const catchAsync = require("../../utils/catchAsync");
const farmWorkflowService = require("../../services/cropfort/farmWorkflow.service");
const benchmarkSurveyService = require("../../services/cropfort/benchmarkSurvey.service");
const electionsService = require("../../services/cropfort/elections.service");
const activityPlansService = require("../../services/cropfort/activityPlans.service");
const feeScheduleService = require("../../services/cropfort/feeSchedule.service");
const supervisorProgressService = require("../../services/cropfort/supervisorProgress.service");
const cashFlowService = require("../../services/cropfort/cashFlow.service");
const monthlyClientReportService = require("../../services/cropfort/monthlyClientReport.service");
const workbookImportService = require("../../services/cropfort/workbookImport.service");

exports.importWorkbook = catchAsync(async (req, res) => {
  const data = await workbookImportService.importWorkbook(
    req.user,
    req.params.farmId,
    req.validatedBody || {},
  );
  res.json({ data });
});

exports.getWorkflow = catchAsync(async (req, res) => {
  const data = await farmWorkflowService.getJourney(req.params.farmId, req.user);
  res.json({ data });
});

exports.completeWorkflowStage = catchAsync(async (req, res) => {
  const data = await farmWorkflowService.markStageComplete(
    req.params.farmId,
    req.params.stageKey,
    req.user,
  );
  res.json({ data });
});

exports.listBenchmarkSurveys = catchAsync(async (req, res) => {
  const data = await benchmarkSurveyService.list(req.user, req.params.farmId, req.query);
  res.json({ data });
});

exports.createBenchmarkSurvey = catchAsync(async (req, res) => {
  const data = await benchmarkSurveyService.create(req.user, req.params.farmId, req.validatedBody);
  res.status(201).json({ data });
});

exports.lockBenchmarkSurvey = catchAsync(async (req, res) => {
  const data = await benchmarkSurveyService.lock(req.user, req.params.surveyId);
  res.json({ data });
});

exports.proposeBenchmarkSurvey = catchAsync(async (req, res) => {
  const data = await benchmarkSurveyService.propose(
    req.user,
    req.params.surveyId,
    req.validatedBody.proposedRate,
  );
  res.json({ data });
});

exports.submitBenchmarkSurvey = catchAsync(async (req, res) => {
  const data = await benchmarkSurveyService.submit(req.user, req.params.surveyId);
  res.json({ data });
});

exports.approveBenchmarkSurvey = catchAsync(async (req, res) => {
  const data = await benchmarkSurveyService.approve(req.user, req.params.surveyId);
  res.json({ data });
});

exports.importBenchmarkSurveys = catchAsync(async (req, res) => {
  const data = await benchmarkSurveyService.importFromWorkbook(req.user, req.params.farmId);
  res.json({ data });
});

exports.markBenchmarkUseNormWage = catchAsync(async (req, res) => {
  const data = await benchmarkSurveyService.markUseNormWage(
    req.user,
    req.params.farmId,
    req.validatedBody.activityId,
  );
  res.json({ data });
});

exports.listElections = catchAsync(async (req, res) => {
  const data = await electionsService.list(req.user, req.params.farmId, req.query);
  res.json({ data });
});

exports.setCoreBundle = catchAsync(async (req, res) => {
  const data = await electionsService.setCoreBundle(
    req.user,
    req.params.farmId,
    req.validatedBody.elected,
  );
  res.json({ data });
});

exports.upsertElection = catchAsync(async (req, res) => {
  const data = await electionsService.upsert(req.user, req.params.farmId, req.validatedBody);
  res.json({ data });
});

exports.submitElection = catchAsync(async (req, res) => {
  const data = await electionsService.submit(req.user, req.params.electionId);
  res.json({ data });
});

exports.approveElection = catchAsync(async (req, res) => {
  const data = await electionsService.approve(req.user, req.params.electionId);
  res.json({ data });
});

exports.listActivityPlans = catchAsync(async (req, res) => {
  const data = await activityPlansService.list(req.user, req.params.farmId, req.query);
  res.json({ data });
});

exports.upsertActivityPlan = catchAsync(async (req, res) => {
  const data = await activityPlansService.upsert(req.user, req.params.farmId, req.validatedBody);
  res.json({ data });
});

exports.createFollowUpPlan = catchAsync(async (req, res) => {
  const data = await activityPlansService.createFollowUp(req.user, req.params.planId);
  res.json({ data });
});

exports.getFeeSchedule = catchAsync(async (req, res) => {
  const data = await feeScheduleService.get(req.user, req.params.farmId);
  res.json({ data });
});

exports.upsertFeeSchedule = catchAsync(async (req, res) => {
  const data = await feeScheduleService.upsert(req.user, req.params.farmId, req.validatedBody);
  res.json({ data });
});

exports.submitFeeSchedule = catchAsync(async (req, res) => {
  const data = await feeScheduleService.submit(req.user, req.params.farmId);
  res.json({ data });
});

exports.approveFeeSchedule = catchAsync(async (req, res) => {
  const data = await feeScheduleService.approve(req.user, req.params.farmId);
  res.json({ data });
});

exports.listSupervisorProgress = catchAsync(async (req, res) => {
  const data = await supervisorProgressService.list(req.user, req.params.farmId, req.query);
  res.json({ data });
});

exports.upsertSupervisorProgress = catchAsync(async (req, res) => {
  const data = await supervisorProgressService.upsert(
    req.user,
    req.validatedBody.activityPlanId,
    req.validatedBody.pctComplete,
    req.validatedBody.lastMovementDate,
  );
  res.json({ data });
});

exports.getCashFlow = catchAsync(async (req, res) => {
  const data = await cashFlowService.getWeeklyCashFlow(
    req.user,
    req.params.farmId,
    req.query.from,
    req.query.to,
  );
  res.json({ data });
});

exports.getBudgetRollup = catchAsync(async (req, res) => {
  const data = await cashFlowService.getBudgetRollup(
    req.user,
    req.params.farmId,
    req.query.planYear,
  );
  res.json({ data });
});

exports.getMonthlyReport = catchAsync(async (req, res) => {
  const data = await monthlyClientReportService.getOrCreate(
    req.user,
    req.params.farmId,
    req.query.reportMonth,
  );
  res.json({ data });
});

exports.updateMonthlyReport = catchAsync(async (req, res) => {
  const data = await monthlyClientReportService.updateNarrative(
    req.user,
    req.params.reportId,
    req.validatedBody,
  );
  res.json({ data });
});

exports.sendMonthlyReport = catchAsync(async (req, res) => {
  const data = await monthlyClientReportService.send(req.user, req.params.reportId);
  res.json({ data });
});
