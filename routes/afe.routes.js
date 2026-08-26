const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const auditLog = require("../middleware/auditLog");
const planning = require("../controllers/planning.controller");
const schemas = require("../schemas");

const SPX_PLAN = ["spx_principal", "spx_account_handler"];
const SILVA_APPROVE = ["silva_owner", "silva_country_manager"];

const afpRoutes = express.Router();
afpRoutes.use(authenticateJWT);
afpRoutes.get("/", planning.findAllAfp);
afpRoutes.post("/", requireRole(SPX_PLAN), validate(schemas.afpCreate), auditLog("afp_line"), planning.createAfp);
afpRoutes.get("/:afpLineId", planning.findOneAfp);
afpRoutes.get("/:afpLineId/schedule", planning.afpSchedule);
afpRoutes.patch("/:afpLineId", requireRole(SPX_PLAN), auditLog("afp_line"), planning.updateAfp);
afpRoutes.post("/:afpLineId/submit", requireRole(SPX_PLAN), auditLog("afp_line"), planning.submitAfp);
afpRoutes.post("/:afpLineId/approve", requireRole(SILVA_APPROVE), auditLog("afp_line"), planning.approveAfp);
afpRoutes.post("/:afpLineId/close", requireRole(["spx_principal"]), auditLog("afp_line"), planning.closeAfp);

const afeRoutes = express.Router();
afeRoutes.use(authenticateJWT);
afeRoutes.get("/", planning.findAllAfe);
afeRoutes.post("/", requireRole(["spx_principal", "spx_account_handler", "vendor_admin", "vendor_manager", "vendor_field_lead"]), validate(schemas.afeCreate), auditLog("afe"), planning.createAfe);
afeRoutes.get("/:afeId", planning.findOneAfe);
afeRoutes.patch("/:afeId", auditLog("afe"), planning.updateAfe);
afeRoutes.post("/:afeId/submit", auditLog("afe"), planning.submitAfe);
afeRoutes.post("/:afeId/validate", requireRole(SPX_PLAN), auditLog("afe"), planning.validateAfe);
afeRoutes.post("/:afeId/approve", auditLog("afe"), planning.approveAfe);
afeRoutes.post("/:afeId/reject", validate(schemas.reasonBody), auditLog("afe"), planning.rejectAfe);
afeRoutes.post("/:afeId/close", requireRole(["spx_principal", "spx_account_handler"]), auditLog("afe"), planning.closeAfe);
afeRoutes.get("/:afeId/history", planning.afeHistory);

module.exports = { afpRoutes, afeRoutes };
