const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const authTotp = require("../services/auth.totp.service");

module.exports = async function requireOtpVerified(req, res, next) {
  try {
    if (!authTotp.otpEnabled()) {
      return next();
    }
    const sessionId = req.user?.sessionId;
    if (!sessionId) {
      return next(
        new AppError(403, "OTP_REQUIRED", "TOTP verification required. Complete OTP verification before accessing Cropfort."),
      );
    }
    const session = await prisma.refresh_sessions.findFirst({
      where: { id: sessionId, userId: req.user.id, revoked: false },
    });
    if (!session?.otpVerifiedAt) {
      return next(
        new AppError(403, "OTP_REQUIRED", "TOTP verification required. Complete OTP verification before accessing Cropfort."),
      );
    }
    await prisma.refresh_sessions.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });
    return next();
  } catch (err) {
    return next(err);
  }
};
