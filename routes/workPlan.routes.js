const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireProgramAccess = require("../middleware/requireProgramAccess");
const requireRole = require("../middleware/requireRole");
const setProgramRls = require("../middleware/setProgramRls");
const validate = require("../middleware/validate");
const auditLog = require("../middleware/auditLog");
const workPlan = require("../controllers/workPlan.controller");
const schemas = require("../schemas");

const { SPX_ROLES, WORK_PLAN_MANAGE_ROLES } = require("../utils/roles");

const router = express.Router();
router.use(authenticateJWT, requireProgramAccess, setProgramRls);

router.get("/", workPlan.list);
router.get("/template", workPlan.template);
router.post("/", requireRole(WORK_PLAN_MANAGE_ROLES), validate(schemas.workPlanCreate), auditLog("work_plan_submission"), workPlan.create);
router.get("/:id", workPlan.findOne);
router.patch("/:id", requireRole(WORK_PLAN_MANAGE_ROLES), validate(schemas.workPlanUpdate), auditLog("work_plan_submission"), workPlan.update);
router.patch("/:id/parsed", requireRole(WORK_PLAN_MANAGE_ROLES), auditLog("work_plan_submission"), workPlan.updateParsed);
router.put(
  "/:id/upload",
  requireRole(WORK_PLAN_MANAGE_ROLES),
  express.raw({ type: "*/*", limit: "15mb" }),
  auditLog("work_plan_submission"),
  workPlan.upload,
);
router.post("/:id/submit", requireRole(WORK_PLAN_MANAGE_ROLES), auditLog("work_plan_submission"), workPlan.submit);
router.post("/:id/request-revision", requireRole(SPX_ROLES), validate(schemas.workPlanReview), auditLog("work_plan_submission"), workPlan.requestRevision);
router.post("/:id/reject", requireRole(SPX_ROLES), validate(schemas.workPlanReview), auditLog("work_plan_submission"), workPlan.reject);
router.post("/:id/accept", requireRole(SPX_ROLES), auditLog("work_plan_submission"), workPlan.accept);

module.exports = router;
