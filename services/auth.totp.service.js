const env = require("../config/env");
const { generateSecret, generateURI, verifySync } = require("otplib");
const QRCode = require("qrcode");
const jwt = require("jsonwebtoken");
const prisma = require("../config/database");
const AppError = require("../utils/AppError");

function otpEnabled() {
  return env.CROPFORT_OTP_ON_LOGIN;
}

function signChallenge(payload) {
  return jwt.sign({ ...payload, typ: "otp_challenge" }, env.JWT_SECRET, { expiresIn: 300 });
}

function verifyChallenge(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (decoded.typ !== "otp_challenge" && decoded.typ !== "totp_enroll") {
      throw new Error("invalid typ");
    }
    return decoded;
  } catch {
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired challenge token.");
  }
}

function verifyCode(secret, code) {
  const result = verifySync({ secret, token: String(code), epochTolerance: 1 });
  return result.valid;
}

async function beginEnrollment(userId) {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found.");
  const secret = generateSecret();
  const otpauth = generateURI({ label: user.email, issuer: "Cropfort", secret });
  const qrDataUrl = await QRCode.toDataURL(otpauth);
  const enrollmentToken = signChallenge({ sub: userId, typ: "totp_enroll", secret });
  return { enrollmentToken, qrDataUrl, otpauth };
}

async function completeEnrollment(enrollmentToken, code) {
  const decoded = verifyChallenge(enrollmentToken);
  if (decoded.typ !== "totp_enroll") {
    throw new AppError(400, "INVALID_STATE", "Invalid enrollment token.");
  }
  if (!verifyCode(decoded.secret, code)) {
    throw new AppError(401, "INVALID_OTP", "Invalid TOTP code.");
  }
  await prisma.users.update({
    where: { id: decoded.sub },
    data: { totpSecret: decoded.secret, totpEnrolledAt: new Date(), accountStatus: "active" },
  });
  return prisma.users.findUnique({ where: { id: decoded.sub } });
}

async function createLoginChallenge(userId) {
  return signChallenge({ sub: userId, typ: "otp_challenge" });
}

async function verifyLoginOtp(challengeToken, code, issueTokens) {
  const decoded = verifyChallenge(challengeToken);
  if (decoded.typ !== "otp_challenge") {
    throw new AppError(400, "INVALID_STATE", "Invalid OTP challenge.");
  }
  const user = await prisma.users.findUnique({ where: { id: decoded.sub } });
  if (!user?.totpSecret) throw new AppError(400, "TOTP_NOT_ENROLLED", "TOTP enrollment required.");
  if (!verifyCode(user.totpSecret, code)) {
    throw new AppError(401, "INVALID_OTP", "Invalid TOTP code.");
  }
  return issueTokens(user, { otpVerified: true });
}

async function listSessions(userId) {
  const rows = await prisma.refresh_sessions.findMany({
    where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      deviceLabel: true,
      otpVerifiedAt: true,
      lastActiveAt: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  return rows.map((s) => ({
    id: s.id,
    deviceLabel: s.deviceLabel || "Unknown device",
    otpVerified: Boolean(s.otpVerifiedAt),
    lastActiveAt: s.lastActiveAt?.toISOString() || null,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  }));
}

async function revokeSession(userId, sessionId) {
  const session = await prisma.refresh_sessions.findFirst({
    where: { id: sessionId, userId, revoked: false },
  });
  if (!session) throw new AppError(404, "NOT_FOUND", "Session not found.");
  await prisma.refresh_sessions.update({ where: { id: sessionId }, data: { revoked: true } });
  return { ok: true };
}

module.exports = {
  otpEnabled,
  beginEnrollment,
  completeEnrollment,
  createLoginChallenge,
  verifyLoginOtp,
  listSessions,
  revokeSession,
};
