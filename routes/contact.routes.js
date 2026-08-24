const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const rateLimit = require("../middleware/rateLimit");
const contact = require("../controllers/contact.controller");
const schemas = require("../schemas");

const SPX_ADMIN = ["system_admin", "spx_principal"];

const router = express.Router();

router.post("/", rateLimit, validate(schemas.contactSubmit), contact.submit);

router.use(authenticateJWT);
router.get("/", requireRole(SPX_ADMIN), contact.list);
router.post("/:id/read", requireRole(SPX_ADMIN), contact.markRead);

module.exports = router;
