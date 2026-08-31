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
};
