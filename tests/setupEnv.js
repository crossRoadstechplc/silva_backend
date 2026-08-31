process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.CROPFORT_OTP_ON_LOGIN = process.env.CROPFORT_OTP_ON_LOGIN || "false";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-value";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret-value";
process.env.JWT_GL_EXPORT_SECRET = process.env.JWT_GL_EXPORT_SECRET || "test-gl-secret-value";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://coffee:coffee@localhost:5432/coffee_field_os?schema=public";
