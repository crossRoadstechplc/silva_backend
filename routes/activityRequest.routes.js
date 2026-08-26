const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const auditLog = require("../middleware/auditLog");
const activityRequest = require("../controllers/activityRequest.controller");
const schemas = require("../schemas");

const SPX_CONVERT = ["spx_principal", "spx_account_handler"];
const CREATE_ROLES = [
  "silva_owner",
  "silva_country_manager",
  "vendor_admin",
  "vendor_manager",
  "vendor_field_lead",
];

const router = express.Router();
router.use(authenticateJWT);

router.get("/work-list-options", activityRequest.workListOptions);
router.get("/", activityRequest.findAll);
router.post(
  "/",
  requireRole(CREATE_ROLES),
  validate(schemas.activityRequestCreate),
  auditLog("activity_request"),
  activityRequest.create,
);
router.get("/:id", activityRequest.findOne);
router.post(
  "/:id/convert",
  requireRole(SPX_CONVERT),
  validate(schemas.activityRequestConvert),
  auditLog("activity_request"),
  activityRequest.convert,
);
router.post(
  "/:id/dismiss",
  requireRole(SPX_CONVERT),
  validate(schemas.activityRequestDismiss),
  auditLog("activity_request"),
  activityRequest.dismiss,
);

module.exports = router;
