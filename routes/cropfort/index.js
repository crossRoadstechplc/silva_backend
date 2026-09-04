const express = require("express");
const validate = require("../../middleware/validate");
const requireCropfortRole = require("../../middleware/requireCropfortRole");
const rateCardController = require("../../controllers/cropfort/rateCard.controller");
const rateCardSchemas = require("../../schemas/cropfort/rateCard.schema");
const activityMasterController = require("../../controllers/cropfort/activityMaster.controller");
const activityMasterSchemas = require("../../schemas/cropfort/activityMaster.schema");
const afpBlockLinesController = require("../../controllers/cropfort/afpBlockLines.controller");
const afpBlockLinesSchemas = require("../../schemas/cropfort/afpBlockLines.schema");
const budgetController = require("../../controllers/cropfort/budget.controller");
const budgetSchemas = require("../../schemas/cropfort/budget.schema");
const blockFieldTicketsController = require("../../controllers/cropfort/blockFieldTickets.controller");
const blockFieldTicketsSchemas = require("../../schemas/cropfort/blockFieldTickets.schema");
const weeklySubmissionsController = require("../../controllers/cropfort/weeklySubmissions.controller");
const weeklySubmissionsSchemas = require("../../schemas/cropfort/weeklySubmissions.schema");
const cropfortAfeController = require("../../controllers/cropfort/cropfortAfe.controller");
const cropfortAfeSchemas = require("../../schemas/cropfort/cropfortAfe.schema");
const dashboardController = require("../../controllers/cropfort/dashboard.controller");
const cropfortAuditController = require("../../controllers/cropfort/cropfortAudit.controller");
const cropfortAdminController = require("../../controllers/cropfort/cropfortAdmin.controller");
const cropfortAdminSchemas = require("../../schemas/cropfort/cropfortAdmin.schema");
const farmPlatformController = require("../../controllers/cropfort/farmPlatform.controller");
const farmPlatformSchemas = require("../../schemas/cropfort/farmPlatform.schema");

const router = express.Router();
const FM = ["field_manager", "bagro_office", "spx_validator", "spx_platform_admin"];
const APPROVER = ["farm_owner", "farm_owner_viewer"];
const ALL_CROPFORT = [...FM, ...APPROVER, "field_supervisor"];

router.get(
  "/rate-card",
  requireCropfortRole("spx_validator", "farm_owner", "spx_platform_admin"),
  rateCardController.list,
);

router.get(
  "/rate-card/meta",
  requireCropfortRole("spx_validator", "farm_owner", "spx_platform_admin"),
  rateCardController.meta,
);

router.get(
  "/labor-rate-cards",
  requireCropfortRole("spx_validator", "farm_owner", "spx_platform_admin", "bagro_office", "field_manager"),
  rateCardController.listLabor,
);

router.post(
  "/rate-card",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(rateCardSchemas.createRateCardLine),
  rateCardController.create,
);

router.patch(
  "/rate-card/:lineId",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(rateCardSchemas.updateRateCardLine),
  rateCardController.update,
);

router.post(
  "/rate-card/submit",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(rateCardSchemas.submitRateCard),
  rateCardController.submit,
);

router.post(
  "/rate-card/:lineId/approve",
  requireCropfortRole("farm_owner"),
  validate(rateCardSchemas.lineComment),
  rateCardController.approveLine,
);

router.post(
  "/rate-card/:lineId/return",
  requireCropfortRole("farm_owner"),
  validate(rateCardSchemas.lineComment),
  rateCardController.returnLine,
);

router.post(
  "/rate-card/:lineId/reopen",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  rateCardController.reopenLine,
);

router.get(
  "/activity-master/templates",
  requireCropfortRole("spx_validator", "spx_platform_admin", "farm_owner", "bagro_office"),
  activityMasterController.listTemplates,
);

router.get(
  "/activity-master",
  requireCropfortRole("spx_validator", "spx_platform_admin", "farm_owner", "bagro_office", "field_supervisor"),
  activityMasterController.list,
);

router.post(
  "/activity-master",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(activityMasterSchemas.createActivityMaster),
  activityMasterController.create,
);

router.patch(
  "/activity-master/:activityId",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(activityMasterSchemas.updateActivityMaster),
  activityMasterController.update,
);

router.get(
  "/afp-blocks",
  requireCropfortRole(
    "spx_validator",
    "spx_platform_admin",
    "farm_owner",
    "bagro_office",
    "field_supervisor",
  ),
  afpBlockLinesController.list,
);

router.post(
  "/afp-blocks",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(afpBlockLinesSchemas.createAfpBlockLine),
  afpBlockLinesController.create,
);

router.patch(
  "/afp-blocks/:lineId",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(afpBlockLinesSchemas.updateAfpBlockLine),
  afpBlockLinesController.update,
);

router.patch(
  "/afp-blocks/:lineId/election",
  requireCropfortRole("spx_validator", "farm_owner", "spx_platform_admin"),
  validate(afpBlockLinesSchemas.updateElection),
  afpBlockLinesController.updateElection,
);

router.post(
  "/afp-blocks/submit",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(afpBlockLinesSchemas.submitAfpBlockLines),
  afpBlockLinesController.submit,
);

router.post(
  "/afp-blocks/:lineId/approve",
  requireCropfortRole("farm_owner"),
  validate(afpBlockLinesSchemas.lineComment),
  afpBlockLinesController.approveLine,
);

router.post(
  "/afp-blocks/:lineId/return",
  requireCropfortRole("farm_owner"),
  validate(afpBlockLinesSchemas.lineComment),
  afpBlockLinesController.returnLine,
);

router.post(
  "/afp-blocks/:lineId/reopen",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  afpBlockLinesController.reopenLine,
);

router.get(
  "/budget",
  requireCropfortRole("spx_validator", "spx_platform_admin", "farm_owner"),
  budgetController.preview,
);

router.post(
  "/budget/estimate",
  requireCropfortRole(
    "spx_validator",
    "spx_platform_admin",
    "farm_owner",
    "bagro_office",
    "field_supervisor",
  ),
  validate(budgetSchemas.estimateBudget),
  budgetController.estimate,
);

router.get(
  "/block-field-tickets",
  requireCropfortRole(
    "spx_validator",
    "spx_platform_admin",
    "farm_owner",
    "bagro_office",
    "field_supervisor",
  ),
  blockFieldTicketsController.list,
);

router.post(
  "/block-field-tickets",
  requireCropfortRole("bagro_office", "field_supervisor", "spx_validator", "spx_platform_admin"),
  validate(blockFieldTicketsSchemas.createBlockFieldTicket),
  blockFieldTicketsController.create,
);

router.patch(
  "/block-field-tickets/:ticketId",
  requireCropfortRole("bagro_office", "field_supervisor", "spx_validator", "spx_platform_admin"),
  validate(blockFieldTicketsSchemas.updateBlockFieldTicket),
  blockFieldTicketsController.update,
);

router.post(
  "/block-field-tickets/:ticketId/submit",
  requireCropfortRole("bagro_office", "field_supervisor", "spx_validator", "spx_platform_admin"),
  blockFieldTicketsController.submit,
);

router.post(
  "/block-field-tickets/:ticketId/review",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(blockFieldTicketsSchemas.reviewBlockFieldTicket),
  blockFieldTicketsController.review,
);

router.post(
  "/block-field-tickets/:ticketId/correction",
  requireCropfortRole("spx_validator", "spx_platform_admin", "bagro_office"),
  validate(blockFieldTicketsSchemas.createCorrection),
  blockFieldTicketsController.createCorrection,
);

router.post(
  "/block-field-tickets/sync",
  requireCropfortRole("bagro_office", "field_supervisor", "spx_validator", "spx_platform_admin"),
  validate(blockFieldTicketsSchemas.syncBlockFieldTickets),
  blockFieldTicketsController.sync,
);

router.post(
  "/block-field-tickets/upload-photo",
  requireCropfortRole("bagro_office", "field_supervisor", "spx_validator", "spx_platform_admin"),
  validate(blockFieldTicketsSchemas.uploadTicketPhoto),
  blockFieldTicketsController.uploadPhoto,
);

router.get(
  "/weekly-submissions",
  requireCropfortRole("spx_validator", "spx_platform_admin", "bagro_office", "farm_owner"),
  weeklySubmissionsController.list,
);

router.get(
  "/weekly-submissions/queue",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  weeklySubmissionsController.getValidationQueue,
);

router.get(
  "/weekly-submissions/:weekEnding",
  requireCropfortRole("spx_validator", "spx_platform_admin", "bagro_office", "farm_owner"),
  weeklySubmissionsController.getByWeek,
);

router.post(
  "/weekly-submissions/:weekEnding/submit",
  requireCropfortRole("bagro_office", "spx_validator", "spx_platform_admin"),
  validate(weeklySubmissionsSchemas.submitWeekly),
  weeklySubmissionsController.submitWeek,
);

router.post(
  "/weekly-submissions/:weekEnding/validate",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  weeklySubmissionsController.validateWeek,
);

router.post(
  "/weekly-submissions/:weekEnding/release",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  weeklySubmissionsController.releaseWeek,
);

router.get(
  "/afes/band-preview",
  requireCropfortRole("spx_validator", "spx_platform_admin", "farm_owner"),
  cropfortAfeController.previewBand,
);

router.get(
  "/afes",
  requireCropfortRole("spx_validator", "spx_platform_admin", "farm_owner"),
  cropfortAfeController.list,
);

router.post(
  "/afes",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(cropfortAfeSchemas.createCropfortAfe),
  cropfortAfeController.create,
);

router.patch(
  "/afes/:afeId",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(cropfortAfeSchemas.updateCropfortAfe),
  cropfortAfeController.update,
);

router.post(
  "/afes/submit",
  requireCropfortRole("spx_validator", "spx_platform_admin"),
  validate(cropfortAfeSchemas.submitCropfortAfes),
  cropfortAfeController.submit,
);

router.post(
  "/afes/:afeId/approve",
  requireCropfortRole("farm_owner"),
  validate(cropfortAfeSchemas.lineComment),
  cropfortAfeController.approve,
);

router.post(
  "/afes/:afeId/return",
  requireCropfortRole("farm_owner"),
  validate(cropfortAfeSchemas.lineComment),
  cropfortAfeController.returnAfe,
);

router.get(
  "/dashboard",
  requireCropfortRole("spx_validator", "spx_platform_admin", "farm_owner"),
  dashboardController.getDashboard,
);

router.get(
  "/audit",
  requireCropfortRole("spx_validator", "spx_platform_admin", "farm_owner"),
  cropfortAuditController.list,
);

router.get(
  "/admin/users",
  requireCropfortRole("spx_platform_admin"),
  cropfortAdminController.listUsers,
);

router.post(
  "/admin/users",
  requireCropfortRole("spx_platform_admin"),
  validate(cropfortAdminSchemas.provisionCropfortUser),
  cropfortAdminController.provisionUser,
);

router.patch(
  "/admin/users/:userId/roles",
  requireCropfortRole("spx_platform_admin"),
  validate(cropfortAdminSchemas.assignCropfortRoles),
  cropfortAdminController.assignRoles,
);

router.post(
  "/admin/users/:userId/suspend",
  requireCropfortRole("spx_platform_admin"),
  cropfortAdminController.suspendUser,
);

router.post(
  "/admin/users/:userId/activate",
  requireCropfortRole("spx_platform_admin"),
  cropfortAdminController.activateUser,
);

router.get(
  "/admin/tenant-config",
  requireCropfortRole("spx_platform_admin"),
  cropfortAdminController.getTenantConfig,
);

router.patch(
  "/admin/tenant-config",
  requireCropfortRole("spx_platform_admin"),
  validate(cropfortAdminSchemas.updateTenantConfig),
  cropfortAdminController.updateTenantConfig,
);

// --- Per-farm progressive platform ---
router.get(
  "/farms/:farmId/workflow",
  requireCropfortRole(...ALL_CROPFORT),
  farmPlatformController.getWorkflow,
);
router.post(
  "/farms/:farmId/workflow/:stageKey/complete",
  requireCropfortRole(...FM, "farm_owner"),
  validate(farmPlatformSchemas.completeStage),
  farmPlatformController.completeWorkflowStage,
);

router.post(
  "/farms/:farmId/import-workbook",
  requireCropfortRole(...FM),
  validate(farmPlatformSchemas.workbookImport),
  farmPlatformController.importWorkbook,
);

router.get(
  "/farms/:farmId/benchmark-surveys",
  requireCropfortRole(...ALL_CROPFORT),
  farmPlatformController.listBenchmarkSurveys,
);
router.post(
  "/farms/:farmId/benchmark-surveys",
  requireCropfortRole(...FM),
  validate(farmPlatformSchemas.benchmarkCreate),
  farmPlatformController.createBenchmarkSurvey,
);
router.post(
  "/farms/:farmId/benchmark-surveys/import",
  requireCropfortRole(...FM),
  farmPlatformController.importBenchmarkSurveys,
);
router.post(
  "/farms/:farmId/benchmark-surveys/use-norm-wage",
  requireCropfortRole(...FM),
  validate(farmPlatformSchemas.useNormWage),
  farmPlatformController.markBenchmarkUseNormWage,
);
router.post(
  "/benchmark-surveys/:surveyId/lock",
  requireCropfortRole(...FM),
  farmPlatformController.lockBenchmarkSurvey,
);
router.post(
  "/benchmark-surveys/:surveyId/propose",
  requireCropfortRole(...FM),
  validate(farmPlatformSchemas.benchmarkPropose),
  farmPlatformController.proposeBenchmarkSurvey,
);
router.post(
  "/benchmark-surveys/:surveyId/submit",
  requireCropfortRole(...FM),
  farmPlatformController.submitBenchmarkSurvey,
);
router.post(
  "/benchmark-surveys/:surveyId/approve",
  requireCropfortRole("farm_owner"),
  farmPlatformController.approveBenchmarkSurvey,
);

router.get(
  "/farms/:farmId/elections",
  requireCropfortRole(...ALL_CROPFORT),
  farmPlatformController.listElections,
);
router.post(
  "/farms/:farmId/elections/core-bundle",
  requireCropfortRole(...FM, "farm_owner"),
  validate(farmPlatformSchemas.coreBundle),
  farmPlatformController.setCoreBundle,
);
router.put(
  "/farms/:farmId/elections",
  requireCropfortRole(...FM),
  validate(farmPlatformSchemas.electionUpsert),
  farmPlatformController.upsertElection,
);
router.post(
  "/elections/:electionId/submit",
  requireCropfortRole(...FM),
  farmPlatformController.submitElection,
);
router.post(
  "/elections/:electionId/approve",
  requireCropfortRole("farm_owner"),
  farmPlatformController.approveElection,
);

router.get(
  "/farms/:farmId/activity-plans",
  requireCropfortRole(...ALL_CROPFORT),
  farmPlatformController.listActivityPlans,
);
router.put(
  "/farms/:farmId/activity-plans",
  requireCropfortRole(...FM),
  validate(farmPlatformSchemas.activityPlanUpsert),
  farmPlatformController.upsertActivityPlan,
);
router.post(
  "/activity-plans/:planId/follow-up",
  requireCropfortRole(...FM),
  farmPlatformController.createFollowUpPlan,
);

router.get(
  "/farms/:farmId/fee-schedule",
  requireCropfortRole(...ALL_CROPFORT),
  farmPlatformController.getFeeSchedule,
);
router.put(
  "/farms/:farmId/fee-schedule",
  requireCropfortRole(...FM),
  validate(farmPlatformSchemas.feeScheduleUpsert),
  farmPlatformController.upsertFeeSchedule,
);
router.post(
  "/farms/:farmId/fee-schedule/submit",
  requireCropfortRole(...FM),
  farmPlatformController.submitFeeSchedule,
);
router.post(
  "/farms/:farmId/fee-schedule/approve",
  requireCropfortRole("farm_owner"),
  farmPlatformController.approveFeeSchedule,
);

router.get(
  "/farms/:farmId/field-work-calendar",
  requireCropfortRole(...ALL_CROPFORT),
  farmPlatformController.getFieldWorkCalendar,
);
router.put(
  "/farms/:farmId/field-work-calendar",
  requireCropfortRole(...FM),
  validate(farmPlatformSchemas.fieldWorkCalendarUpsert),
  farmPlatformController.upsertFieldWorkCalendar,
);
router.post(
  "/farms/:farmId/field-work-calendar/seed",
  requireCropfortRole(...FM),
  farmPlatformController.seedFieldWorkCalendar,
);
router.post(
  "/farms/:farmId/field-work-calendar/submit",
  requireCropfortRole(...FM),
  farmPlatformController.submitFieldWorkCalendar,
);
router.post(
  "/farms/:farmId/field-work-calendar/approve",
  requireCropfortRole("farm_owner"),
  farmPlatformController.approveFieldWorkCalendar,
);
router.post(
  "/farms/:farmId/field-work-calendar/return",
  requireCropfortRole("farm_owner"),
  validate(farmPlatformSchemas.fieldWorkCalendarReturn),
  farmPlatformController.returnFieldWorkCalendar,
);

router.get(
  "/farms/:farmId/supervisor-progress",
  requireCropfortRole(...ALL_CROPFORT),
  farmPlatformController.listSupervisorProgress,
);
router.put(
  "/farms/:farmId/supervisor-progress",
  requireCropfortRole("field_supervisor", ...FM),
  validate(farmPlatformSchemas.supervisorProgressUpsert),
  farmPlatformController.upsertSupervisorProgress,
);

router.get(
  "/farms/:farmId/cash-flow",
  requireCropfortRole(...ALL_CROPFORT),
  farmPlatformController.getCashFlow,
);
router.get(
  "/farms/:farmId/budget-rollup",
  requireCropfortRole(...ALL_CROPFORT),
  farmPlatformController.getBudgetRollup,
);

router.get(
  "/farms/:farmId/monthly-report",
  requireCropfortRole(...ALL_CROPFORT),
  farmPlatformController.getMonthlyReport,
);
router.patch(
  "/monthly-reports/:reportId",
  requireCropfortRole(...FM),
  validate(farmPlatformSchemas.monthlyReportUpdate),
  farmPlatformController.updateMonthlyReport,
);
router.post(
  "/monthly-reports/:reportId/send",
  requireCropfortRole(...FM, "farm_owner"),
  farmPlatformController.sendMonthlyReport,
);

module.exports = router;
