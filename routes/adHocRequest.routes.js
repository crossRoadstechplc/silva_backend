const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireProgramAccess = require("../middleware/requireProgramAccess");
const requireRole = require("../middleware/requireRole");
const setProgramRls = require("../middleware/setProgramRls");
const validate = require("../middleware/validate");
const auditLog = require("../middleware/auditLog");
const schemas = require("../schemas");
const adHoc = require("../controllers/adHocRequest.controller");

const SILVA = ["silva_owner", "silva_country_manager", "silva_finance"];
const SPX = ["spx_principal", "spx_account_handler", "spx_field_supervisor", "system_admin"];
const BOTH = [...SILVA, ...SPX];

const router = express.Router();
router.use(authenticateJWT, requireProgramAccess, setProgramRls);

router.get("/", requireRole(BOTH), adHoc.list);
router.post("/", requireRole(SILVA), validate(schemas.adHocRequestCreate), auditLog("ad_hoc_request"), adHoc.create);
router.get("/:id", requireRole(BOTH), adHoc.findOne);
router.patch("/:id", requireRole(SILVA), validate(schemas.adHocRequestUpdate), auditLog("ad_hoc_request"), adHoc.update);
router.post("/:id/submit", requireRole(SILVA), auditLog("ad_hoc_request"), adHoc.submit);
router.post("/:id/dismiss", requireRole(SPX), validate(schemas.adHocRequestDismiss), auditLog("ad_hoc_request"), adHoc.dismiss);
router.post("/:id/convert", requireRole(SPX), validate(schemas.adHocRequestConvert), auditLog("ad_hoc_request"), adHoc.convert);

module.exports = router;
