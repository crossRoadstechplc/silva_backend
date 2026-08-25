const express = require("express");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const schemas = require("../schemas");
const message = require("../controllers/message.controller");

const MESSAGE_ROLES = [
  "spx_principal",
  "spx_account_handler",
  "spx_field_supervisor",
  "vendor_admin",
  "vendor_manager",
  "vendor_supervisor",
  "vendor_field_lead",
  "silva_owner",
  "silva_country_manager",
  "silva_finance",
];

const router = express.Router();
router.use(requireRole(MESSAGE_ROLES));

router.get("/counterparties", message.listCounterparties);
router.get("/threads", message.listThreads);
router.post("/threads", validate(schemas.messageThreadCreate), message.createThread);
router.get("/threads/:threadId", message.getThread);
router.post("/threads/:threadId/messages", validate(schemas.messageReply), message.reply);
router.post("/threads/:threadId/read", message.markRead);
router.patch("/threads/:threadId", validate(schemas.messageThreadPatch), message.patchThread);

module.exports = router;
