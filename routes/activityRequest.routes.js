const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireProgramAccess = require("../middleware/requireProgramAccess");
const validate = require("../middleware/validate");
const auditLog = require("../middleware/auditLog");
const activityRequestController = require("../controllers/activityRequest.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT, requireProgramAccess);

router.post(
  "/",
  validate(schemas.activityRequestCreate),
  auditLog("activity_request"),
  activityRequestController.create,
);
router.get("/", activityRequestController.findAll);
router.get("/:requestId", activityRequestController.findOne);
router.post(
  "/:requestId/convert",
  validate(schemas.activityRequestConvert),
  auditLog("activity_request"),
  activityRequestController.convert,
);
router.post(
  "/:requestId/dismiss",
  validate(schemas.reasonBody),
  auditLog("activity_request"),
  activityRequestController.dismiss,
);

module.exports = router;
