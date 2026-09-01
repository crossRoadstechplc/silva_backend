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
const VENDOR = ["vendor_admin", "vendor_manager", "vendor_supervisor", "vendor_field_lead"];
const READERS = [...SILVA, ...SPX, ...VENDOR];
const SUBMITTERS = [...SILVA, ...SPX, ...VENDOR];

const router = express.Router();
router.use(authenticateJWT, requireProgramAccess, setProgramRls);

router.get("/stats/summary", requireRole(READERS), adHoc.stats);
router.get("/", requireRole(READERS), adHoc.list);
router.post("/", requireRole(SUBMITTERS), validate(schemas.adHocRequestCreate), auditLog("ad_hoc_request"), adHoc.create);
router.get("/:id", requireRole(READERS), adHoc.findOne);
router.patch("/:id", requireRole(SUBMITTERS), validate(schemas.adHocRequestUpdate), auditLog("ad_hoc_request"), adHoc.update);
router.post("/:id/submit", requireRole(SUBMITTERS), auditLog("ad_hoc_request"), adHoc.submit);
router.post("/:id/dismiss", requireRole(SPX), validate(schemas.adHocRequestDismiss), auditLog("ad_hoc_request"), adHoc.dismiss);
router.post("/:id/convert", requireRole(SPX), validate(schemas.adHocRequestConvert), auditLog("ad_hoc_request"), adHoc.convert);
router.post(
  "/:id/convert-cropfort",
  requireRole(SPX),
  validate(schemas.adHocRequestConvertCropfort),
  auditLog("ad_hoc_request"),
  adHoc.convertCropfort,
);

module.exports = router;
