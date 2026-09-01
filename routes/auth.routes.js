const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const rateLimit = require("../middleware/rateLimit");
const authController = require("../controllers/auth.controller");
const schemas = require("../schemas");

const router = express.Router();

router.get("/config", authController.config);
router.post("/login", rateLimit, validate(schemas.login), authController.login);
router.post("/otp/verify", rateLimit, validate(schemas.verifyOtp), authController.verifyOtp);
router.post("/totp/enroll", rateLimit, validate(schemas.enrollTotp), authController.enrollTotp);
router.post("/signup", rateLimit, authController.signup);
router.post("/logout", authenticateJWT, authController.logout);
router.post("/refresh", rateLimit, validate(schemas.refresh), authController.refresh);
router.get("/me", authenticateJWT, authController.me);
router.post("/switch-program", authenticateJWT, validate(schemas.switchProgram), authController.switchProgram);
router.patch("/tenant/branding", authenticateJWT, validate(schemas.tenantBranding), authController.updateTenantBranding);
router.post("/onboarding/complete", authenticateJWT, validate(schemas.tenantBranding), authController.completeOnboarding);
router.post("/password/forgot", rateLimit, validate(schemas.forgot), authController.forgot);
router.post("/password/reset", rateLimit, validate(schemas.reset), authController.reset);
router.post("/password/change", authenticateJWT, validate(schemas.changePassword), authController.changePassword);
router.get("/sessions", authenticateJWT, authController.listSessions);
router.delete("/sessions/:sessionId", authenticateJWT, authController.revokeSession);

module.exports = router;
