require("dotenv").config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 3000),
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || "dev-jwt-secret",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  JWT_GL_EXPORT_SECRET: process.env.JWT_GL_EXPORT_SECRET || "dev-gl-export-secret",
  JWT_ACCESS_EXPIRES_IN: Number(process.env.JWT_ACCESS_EXPIRES_IN || 3600),
  JWT_REFRESH_EXPIRES_IN: Number(process.env.JWT_REFRESH_EXPIRES_IN || 604800),
  REDIS_URL: process.env.REDIS_URL || "",
  S3_ENDPOINT: process.env.S3_ENDPOINT || "",
  S3_REGION: process.env.S3_REGION || "eu-west-3",
  S3_BUCKET: process.env.S3_BUCKET || "Silva Proj Bucket",
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || "",
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || "",
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE !== "false",
  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS || 10),
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 20),
  CROPFORT_OTP_ON_LOGIN: process.env.CROPFORT_OTP_ON_LOGIN !== "false",
  APP_BASE_URL: process.env.APP_BASE_URL || process.env.CLIENT_URL || "http://localhost:3000",
  /** Comma-separated browser origins allowed for CORS (e.g. https://farm.spxafrica.com) */
  CORS_ORIGINS: process.env.CORS_ORIGINS || "",
  MAIL_FROM: process.env.MAIL_FROM || "CropFort <onboarding@cropfort.local>",
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: (() => {
    const port = Number(process.env.SMTP_PORT || 587);
    return Number.isFinite(port) ? port : 587;
  })(),
  SMTP_SECURE: (() => {
    if (process.env.SMTP_SECURE === "true") return true;
    if (process.env.SMTP_SECURE === "false") return false;
    const port = Number(process.env.SMTP_PORT || 587);
    return port === 465;
  })(),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  MAIL_TEST_TO: process.env.MAIL_TEST_TO || "",
  /** When true, all mail goes to MAIL_TEST_TO instead of the real recipient (dev only). */
  MAIL_TEST_REDIRECT: process.env.MAIL_TEST_REDIRECT === "true",
  /** auto (default) = Resend then SMTP; smtp = nodemailer only; resend = Resend API only */
  MAIL_PROVIDER: (process.env.MAIL_PROVIDER || "auto").toLowerCase(),
};
