const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const rateLimit = require("../middleware/rateLimit");
const authController = require("../controllers/auth.controller");
const schemas = require("../schemas");

const router = express.Router();

router.post("/login", rateLimit, validate(schemas.login), authController.login);
router.post("/logout", authenticateJWT, authController.logout);
router.post("/refresh", rateLimit, validate(schemas.refresh), authController.refresh);
router.get("/me", authenticateJWT, authController.me);
router.post("/password/forgot", rateLimit, validate(schemas.forgot), authController.forgot);
router.post("/password/reset", rateLimit, validate(schemas.reset), authController.reset);

module.exports = router;
