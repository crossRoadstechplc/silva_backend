// Ensure Jest picks up the backend's .env so DATABASE_URL/JWT secrets match runtime.
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.CROPFORT_OTP_ON_LOGIN = process.env.CROPFORT_OTP_ON_LOGIN || "false";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-value";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret-value";
process.env.JWT_GL_EXPORT_SECRET = process.env.JWT_GL_EXPORT_SECRET || "test-gl-secret-value";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://coffee:coffee@localhost:5432/coffee_field_os?schema=public";

// Jest runs in CommonJS mode and can't parse some ESM-only transitive deps
// pulled in by `otplib` (via `auth.totp.service.js`).
// For integration tests, OTP is disabled by default, so we can safely stub it.
jest.mock("otplib", () => ({
  generateSecret: () => "otplib_test_secret",
  generateURI: () => "otpauth://totp/test",
  verifySync: () => ({ valid: true }),
}));

