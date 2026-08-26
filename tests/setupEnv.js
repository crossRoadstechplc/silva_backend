require("dotenv").config();

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-value";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret-value";
process.env.JWT_GL_EXPORT_SECRET = process.env.JWT_GL_EXPORT_SECRET || "test-gl-secret-value";

const fallbackUrl = "postgresql://coffee:coffee@localhost:5432/coffee_field_os?schema=public";
let dbUrl = process.env.DATABASE_URL || fallbackUrl;

// Cap Prisma pool so integration tests don't exhaust Supabase session-mode (pool_size ~15).
try {
  const u = new URL(dbUrl);
  if (!u.searchParams.has("connection_limit")) {
    u.searchParams.set("connection_limit", "1");
  }
  dbUrl = u.toString();
} catch {
  /* keep as-is */
}

process.env.DATABASE_URL = dbUrl;
