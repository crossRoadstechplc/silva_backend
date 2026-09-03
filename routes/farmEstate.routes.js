const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireProgramAccess = require("../middleware/requireProgramAccess");
const requireRole = require("../middleware/requireRole");
const setProgramRls = require("../middleware/setProgramRls");
const validate = require("../middleware/validate");
const auditLog = require("../middleware/auditLog");
const farmEstate = require("../controllers/farmEstate.controller");
const schemas = require("../schemas");

const SPX = ["spx_principal", "spx_account_handler", "spx_field_supervisor", "system_admin"];

const router = express.Router();
router.use(authenticateJWT, requireProgramAccess, setProgramRls);

router.get("/", farmEstate.list);
router.post("/", requireRole(SPX), validate(schemas.farmEstateCreate), auditLog("farm_estate"), farmEstate.create);
router.get("/:id", farmEstate.findOne);
router.patch("/:id", requireRole(SPX), validate(schemas.farmEstateUpdate), auditLog("farm_estate"), farmEstate.update);
router.put("/:id/vendors", requireRole(SPX), validate(schemas.farmEstateVendors), auditLog("farm_estate"), farmEstate.setVendors);
router.post("/:id/blocks", requireRole(SPX), validate(schemas.farmBlockCreate), auditLog("farm_block"), farmEstate.addBlock);
router.patch("/:id/blocks/:blockId", requireRole(SPX), validate(schemas.farmBlockUpdate), auditLog("farm_block"), farmEstate.updateBlock);
router.delete("/:id/blocks/:blockId", requireRole(SPX), auditLog("farm_block"), farmEstate.removeBlock);

module.exports = router;
