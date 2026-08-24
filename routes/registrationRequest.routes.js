const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const rateLimit = require("../middleware/rateLimit");
const auditLog = require("../middleware/auditLog");
const registrationRequest = require("../controllers/registrationRequest.controller");
const schemas = require("../schemas");

const SPX_ADMIN = ["system_admin", "spx_principal"];

const router = express.Router();

router.post("/", rateLimit, validate(schemas.registrationSubmit), registrationRequest.submit);
router.post("/activate", rateLimit, validate(schemas.registrationActivate), registrationRequest.activate);
router.get("/activation", rateLimit, registrationRequest.checkActivation);

router.use(authenticateJWT);
router.get("/", requireRole(SPX_ADMIN), registrationRequest.list);
router.get("/:id", requireRole(SPX_ADMIN), registrationRequest.findOne);
router.post(
  "/:id/under-review",
  requireRole(SPX_ADMIN),
  validate(schemas.registrationReviewNotes),
  auditLog("registration_request"),
  registrationRequest.markUnderReview,
);
router.post(
  "/:id/approve",
  requireRole(SPX_ADMIN),
  validate(schemas.registrationReviewNotes),
  auditLog("registration_request"),
  registrationRequest.approve,
);
router.post(
  "/:id/reject",
  requireRole(SPX_ADMIN),
  validate(schemas.registrationReject),
  auditLog("registration_request"),
  registrationRequest.reject,
);

module.exports = router;
