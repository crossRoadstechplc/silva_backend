const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const auditLog = require("../middleware/auditLog");
const exec = require("../controllers/execution.controller");
const schemas = require("../schemas");

const SPX = ["spx_principal", "spx_account_handler", "spx_field_supervisor", "system_admin"];
const VENDOR_LEAD = ["vendor_manager", "vendor_supervisor", "vendor_field_lead", "vendor_admin", ...SPX];
const FT_CREATE = ["vendor_field_lead", "vendor_worker", "vendor_supervisor", "vendor_manager"];

const workOrderRoutes = express.Router();
workOrderRoutes.use(authenticateJWT);
workOrderRoutes.get("/", exec.findAllWo);
workOrderRoutes.post("/", requireRole(SPX), validate(schemas.woCreate), auditLog("work_order"), exec.createWo);
workOrderRoutes.get("/:workOrderId", exec.findOneWo);
workOrderRoutes.patch("/:workOrderId", requireRole(SPX), auditLog("work_order"), exec.updateWo);
workOrderRoutes.post("/:workOrderId/issue", requireRole(SPX), auditLog("work_order"), exec.issueWo);
workOrderRoutes.post("/:workOrderId/start", auditLog("work_order"), exec.startWo);
workOrderRoutes.post("/:workOrderId/complete", auditLog("work_order"), exec.completeWo);
workOrderRoutes.post("/:workOrderId/close", requireRole(SPX), auditLog("work_order"), exec.closeWo);
workOrderRoutes.get("/:workOrderId/assignments", exec.listAssignments);
workOrderRoutes.post("/:workOrderId/assignments", requireRole(SPX), validate(schemas.assignmentCreate), exec.addAssignment);
workOrderRoutes.patch("/:workOrderId/assignments/:assignmentId", requireRole(SPX), exec.patchAssignment);
workOrderRoutes.get("/:workOrderId/tasks", exec.listTasks);
workOrderRoutes.post("/:workOrderId/tasks", requireRole(VENDOR_LEAD), validate(schemas.taskCreate), exec.createTask);

const taskRoutes = express.Router();
taskRoutes.use(authenticateJWT);
taskRoutes.get("/:taskId", exec.findTask);
taskRoutes.patch("/:taskId", exec.updateTask);
taskRoutes.post("/:taskId/start", exec.startTask);
taskRoutes.post("/:taskId/complete", exec.completeTask);
taskRoutes.post("/:taskId/cancel", validate(schemas.reasonBody), exec.cancelTask);

const fieldTicketRoutes = express.Router();
fieldTicketRoutes.use(authenticateJWT);
fieldTicketRoutes.get("/", exec.findAllFt);
fieldTicketRoutes.post("/", requireRole(FT_CREATE), validate(schemas.ftCreate), auditLog("field_ticket"), exec.createFt);
fieldTicketRoutes.get("/:fieldTicketId", exec.findOneFt);
fieldTicketRoutes.patch("/:fieldTicketId", auditLog("field_ticket"), exec.updateFt);
fieldTicketRoutes.post("/:fieldTicketId/submit", auditLog("field_ticket"), exec.submitFt);
fieldTicketRoutes.post("/:fieldTicketId/vendor-review", requireRole(["vendor_supervisor", "vendor_manager", "vendor_admin"]), auditLog("field_ticket"), exec.vendorReviewFt);
fieldTicketRoutes.post("/:fieldTicketId/validate", requireRole(["spx_field_supervisor", "spx_account_handler", "spx_principal"]), auditLog("field_ticket"), exec.validateFt);
fieldTicketRoutes.post("/:fieldTicketId/reject", validate(schemas.reasonBody), auditLog("field_ticket"), exec.rejectFt);
fieldTicketRoutes.get("/:fieldTicketId/history", exec.ftHistory);

const paymentRequestRoutes = express.Router();
paymentRequestRoutes.use(authenticateJWT);
paymentRequestRoutes.get("/", exec.findAllPr);
paymentRequestRoutes.post("/", validate(schemas.prCreate), auditLog("payment_request"), exec.createPr);
paymentRequestRoutes.get("/:paymentRequestId", exec.findOnePr);
paymentRequestRoutes.patch("/:paymentRequestId", auditLog("payment_request"), exec.updatePr);
paymentRequestRoutes.post("/:paymentRequestId/submit", auditLog("payment_request"), exec.submitPr);
paymentRequestRoutes.post("/:paymentRequestId/verify", requireRole(["spx_account_handler", "spx_principal"]), auditLog("payment_request"), exec.verifyPr);
paymentRequestRoutes.post("/:paymentRequestId/reject", validate(schemas.reasonBody), auditLog("payment_request"), exec.rejectPr);
paymentRequestRoutes.post("/:paymentRequestId/settle", auditLog("payment_request"), exec.settlePr);
paymentRequestRoutes.get("/:paymentRequestId/history", exec.prHistory);

const settlementRoutes = express.Router();
settlementRoutes.use(authenticateJWT);
settlementRoutes.get("/", exec.findAllStl);
settlementRoutes.post("/", requireRole(SPX), validate(schemas.stlCreate), auditLog("owner_settlement"), exec.createStl);
settlementRoutes.get("/:settlementId", exec.findOneStl);
settlementRoutes.patch("/:settlementId", requireRole(SPX), auditLog("owner_settlement"), exec.updateStl);
settlementRoutes.post("/:settlementId/authorize", requireRole(SPX), auditLog("owner_settlement"), exec.authorizeStl);
settlementRoutes.post("/:settlementId/mark-settled", requireRole([...SPX, "silva_finance"]), auditLog("owner_settlement"), exec.markSettled);

module.exports = { workOrderRoutes, taskRoutes, fieldTicketRoutes, paymentRequestRoutes, settlementRoutes };
