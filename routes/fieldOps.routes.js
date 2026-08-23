const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const auditLog = require("../middleware/auditLog");
const fieldOps = require("../controllers/fieldOps.controller");
const schemas = require("../schemas");

const SPX = ["spx_principal", "spx_account_handler", "spx_field_supervisor", "system_admin"];
const VENDOR_OR_SPX = [
  "vendor_admin",
  "vendor_supervisor",
  "vendor_field_lead",
  "vendor_worker",
  "vendor_manager",
  ...SPX,
];

const ifsFormRoutes = express.Router();
ifsFormRoutes.use(authenticateJWT);
ifsFormRoutes.get("/catalog", fieldOps.ifsCatalog);
ifsFormRoutes.get("/", fieldOps.ifsFindAll);
ifsFormRoutes.post("/", requireRole(VENDOR_OR_SPX), validate(schemas.ifsFormCreate), auditLog("ifs_form"), fieldOps.ifsCreate);
ifsFormRoutes.get("/:formId", fieldOps.ifsFindOne);
ifsFormRoutes.patch("/:formId", requireRole(VENDOR_OR_SPX), auditLog("ifs_form"), fieldOps.ifsUpdate);
ifsFormRoutes.post("/:formId/submit", requireRole(VENDOR_OR_SPX), auditLog("ifs_form"), fieldOps.ifsSubmit);
ifsFormRoutes.post("/:formId/vendor-review", requireRole(["vendor_manager", "vendor_supervisor", "vendor_admin"]), auditLog("ifs_form"), fieldOps.ifsVendorReview);
ifsFormRoutes.patch("/:formId/include-in-report", requireRole(SPX), validate(schemas.ifsIncludeInReport), fieldOps.ifsIncludeInReport);
ifsFormRoutes.post("/:formId/validate", requireRole(SPX), auditLog("ifs_form"), fieldOps.ifsValidate);
ifsFormRoutes.post("/:formId/reject", requireRole(SPX), validate(schemas.reasonBody), auditLog("ifs_form"), fieldOps.ifsReject);

const seasonCalendarRoutes = express.Router();
seasonCalendarRoutes.use(authenticateJWT);
seasonCalendarRoutes.get("/", fieldOps.calFindAll);
seasonCalendarRoutes.post("/", requireRole(SPX), validate(schemas.seasonCalendarCreate), auditLog("season_calendar"), fieldOps.calCreate);
seasonCalendarRoutes.get("/:calendarId", fieldOps.calFindOne);
seasonCalendarRoutes.patch("/:calendarId", requireRole(SPX), auditLog("season_calendar"), fieldOps.calUpdate);
seasonCalendarRoutes.post(
  "/:calendarId/windows",
  requireRole(SPX),
  validate(schemas.seasonWindowCreate),
  auditLog("season_window"),
  fieldOps.calAddWindow,
);

const seasonWindowRoutes = express.Router();
seasonWindowRoutes.use(authenticateJWT);
seasonWindowRoutes.patch("/:windowId", auditLog("season_window"), fieldOps.calUpdateWindow);
seasonWindowRoutes.post("/:windowId/issue", requireRole(SPX), auditLog("season_window"), fieldOps.calIssueWindow);
seasonWindowRoutes.post("/:windowId/start", requireRole(VENDOR_OR_SPX), auditLog("season_window"), fieldOps.calStartWindow);
seasonWindowRoutes.post("/:windowId/complete", requireRole(VENDOR_OR_SPX), auditLog("season_window"), fieldOps.calCompleteWindow);

module.exports = { ifsFormRoutes, seasonCalendarRoutes, seasonWindowRoutes };
