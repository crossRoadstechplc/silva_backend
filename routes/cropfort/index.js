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

const router = express.Router();

router.get(
  "/rate-card",
  requireCropfortRole("spx_validator", "farm_owner", "spx_platform_admin"),
  rateCardController.list,
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

router.get(
  "/budget",
  requireCropfortRole("spx_validator", "spx_platform_admin", "farm_owner"),
  budgetController.preview,
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

module.exports = router;
