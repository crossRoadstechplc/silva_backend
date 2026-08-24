const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireProgramAccess = require("../middleware/requireProgramAccess");
const setProgramRls = require("../middleware/setProgramRls");
const itemActivity = require("../controllers/itemActivity.controller");

const router = express.Router();
router.use(authenticateJWT, requireProgramAccess, setProgramRls);

router.get("/:entityType/:entityId/activity", itemActivity.listActivity);
router.post("/:entityType/:entityId/comments", itemActivity.createComment);

module.exports = router;
