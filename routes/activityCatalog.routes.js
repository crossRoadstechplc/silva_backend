const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireProgramAccess = require("../middleware/requireProgramAccess");
const setProgramRls = require("../middleware/setProgramRls");
const activityCatalog = require("../controllers/activityCatalog.controller");

const router = express.Router();
router.use(authenticateJWT, requireProgramAccess, setProgramRls);

router.get("/", activityCatalog.list);
router.get("/by-afp/:afpLineId/summary", activityCatalog.summaryByAfp);
router.get("/:activityId", activityCatalog.findOne);

module.exports = router;
