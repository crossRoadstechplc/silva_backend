const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const auditLog = require("../middleware/auditLog");
const platform = require("../controllers/platform.controller");
const schemas = require("../schemas");

const SPX = ["spx_principal", "spx_account_handler", "spx_field_supervisor", "system_admin"];
const SILVA = ["silva_owner", "silva_country_manager", "silva_finance"];

const vendorRoutes = express.Router();
vendorRoutes.use(authenticateJWT);
vendorRoutes.get("/", platform.findAllVendors);
vendorRoutes.post("/", requireRole(SPX), validate(schemas.vendorCreate), auditLog("vendor"), platform.createVendor);
vendorRoutes.get("/:vendorId", platform.findOneVendor);
vendorRoutes.patch("/:vendorId", requireRole(SPX), auditLog("vendor"), platform.updateVendor);
vendorRoutes.post("/:vendorId/activate", requireRole(SPX), platform.activateVendor);
vendorRoutes.post("/:vendorId/deactivate", requireRole(SPX), platform.deactivateVendor);
vendorRoutes.get("/:vendorId/users", platform.vendorUsers);
vendorRoutes.post("/:vendorId/users/invite", validate(schemas.inviteCreate), platform.vendorInvite);

const contractRoutes = express.Router();
contractRoutes.use(authenticateJWT);
contractRoutes.get("/", platform.listContracts);
contractRoutes.post("/", requireRole(SPX), validate(schemas.contractCreate), platform.createContract);
contractRoutes.get("/:contractId", platform.findContract);
contractRoutes.patch("/:contractId", requireRole(SPX), platform.updateContract);

const scorecardRoutes = express.Router();
scorecardRoutes.use(authenticateJWT);
scorecardRoutes.get("/", platform.listScorecards);
scorecardRoutes.post("/", requireRole(SPX), validate(schemas.scorecardCreate), platform.createScorecard);
scorecardRoutes.get("/:scorecardId", platform.findScorecard);
scorecardRoutes.patch("/:scorecardId", requireRole(SPX), platform.updateScorecard);

const dashboardRoutes = express.Router();
dashboardRoutes.use(authenticateJWT);
dashboardRoutes.get("/silva-owner", requireRole([...SILVA, ...SPX]), platform.silvaOwner);
dashboardRoutes.get("/spx-management", requireRole(SPX), platform.spxManagement);
dashboardRoutes.get("/vendor-field", platform.vendorField);
dashboardRoutes.get("/notifications", platform.dashboardNotifications);

const PRINCIPAL = ["spx_principal"];

const revenueRoutes = express.Router();
revenueRoutes.use(authenticateJWT);
revenueRoutes.use(requireRole(PRINCIPAL));
revenueRoutes.get("/", platform.listRevenue);
revenueRoutes.post("/", validate(schemas.revenueCreate), auditLog("revenue_ledger"), platform.createRevenue);
revenueRoutes.get("/:entryId", platform.findRevenue);
revenueRoutes.patch("/:entryId", auditLog("revenue_ledger"), platform.updateRevenue);
revenueRoutes.post("/:entryId/export", platform.exportRevenue);

const bvaRoutes = express.Router();
bvaRoutes.use(authenticateJWT);
bvaRoutes.get("/", platform.bva);
bvaRoutes.get("/summary", platform.bvaSummary);
bvaRoutes.patch("/config", requireRole(["spx_principal"]), platform.bvaConfig);

const reportRoutes = express.Router();
reportRoutes.use(authenticateJWT);
reportRoutes.get("/", platform.listReports);
reportRoutes.post("/generate/weekly", requireRole(SPX), platform.generateWeekly);
reportRoutes.post("/generate/monthly", requireRole(SPX), platform.generateMonthly);
reportRoutes.post("/generate/quarterly", requireRole(SPX), platform.generateQuarterly);
reportRoutes.post("/generate/annual", requireRole(SPX), platform.generateAnnual);
reportRoutes.get("/:reportId", platform.findReport);
reportRoutes.patch("/:reportId/narrative", requireRole(SPX), platform.patchNarrative);
reportRoutes.post("/:reportId/release", requireRole(["spx_principal", "spx_account_handler"]), auditLog("report"), platform.releaseReport);

const notificationRoutes = express.Router();
notificationRoutes.use(authenticateJWT);
notificationRoutes.get("/", platform.listNotifications);
notificationRoutes.post("/:notificationId/acknowledge", platform.ackNotification);

const auditRoutes = express.Router();
auditRoutes.use(authenticateJWT);
auditRoutes.get("/", platform.listAudit);
auditRoutes.get("/:auditId", platform.findAudit);

const disclosureRoutes = express.Router();
disclosureRoutes.use(authenticateJWT);
disclosureRoutes.get("/", platform.listDisclosures);
disclosureRoutes.post("/", requireRole(SPX), validate(schemas.disclosureCreate), platform.createDisclosure);
disclosureRoutes.patch("/:disclosureId", requireRole(SPX), platform.patchDisclosure);

const accountabilityRoutes = express.Router();
accountabilityRoutes.use(authenticateJWT);
accountabilityRoutes.get("/", platform.listAccountability);
accountabilityRoutes.post("/", requireRole(["spx_principal"]), platform.createAccountability);
accountabilityRoutes.patch("/:operatingDiscipline", requireRole(["spx_principal"]), platform.patchAccountability);

const schedule3Routes = express.Router();
schedule3Routes.use(authenticateJWT);
schedule3Routes.get("/", platform.listSchedule3);
schedule3Routes.patch("/:band", requireRole(["spx_principal"]), platform.patchSchedule3);

const schedule4Routes = express.Router();
schedule4Routes.use(authenticateJWT);
schedule4Routes.get("/", platform.listSchedule4);
schedule4Routes.patch("/:ruleId", requireRole(["spx_principal"]), platform.patchSchedule4);

const coaRoutes = express.Router();
coaRoutes.use(authenticateJWT);
coaRoutes.get("/", platform.listCoa);
coaRoutes.post("/", requireRole(SPX), validate(schemas.coaCreate), platform.createCoa);
coaRoutes.patch("/:mappingId", requireRole(SPX), platform.patchCoa);

const glRoutes = express.Router();
glRoutes.use(authenticateJWT);
glRoutes.get("/", requireRole(SPX), platform.listGl);
glRoutes.post("/generate", requireRole(SPX), platform.generateGl);
glRoutes.get("/:exportId", platform.findGl);

const attachmentRoutes = express.Router();
attachmentRoutes.use(authenticateJWT);
attachmentRoutes.get("/", platform.listAttachments);
attachmentRoutes.post("/upload-url", validate(schemas.attachmentUpload), platform.uploadUrl);
attachmentRoutes.post("/", validate(schemas.attachmentCreate), platform.createAttachment);
attachmentRoutes.get("/:attachmentId", platform.findAttachment);
attachmentRoutes.delete("/:attachmentId", platform.deleteAttachment);

module.exports = {
  vendorRoutes,
  contractRoutes,
  scorecardRoutes,
  dashboardRoutes,
  revenueRoutes,
  bvaRoutes,
  reportRoutes,
  notificationRoutes,
  auditRoutes,
  disclosureRoutes,
  accountabilityRoutes,
  schedule3Routes,
  schedule4Routes,
  coaRoutes,
  glRoutes,
  attachmentRoutes,
};
