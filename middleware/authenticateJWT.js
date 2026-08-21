const jwt = require("jsonwebtoken");
const env = require("../config/env");
const prisma = require("../config/database");
const AppError = require("../utils/AppError");

const PUBLIC = new Set([
  "POST /auth/login",
  "POST /auth/signup",
  "POST /auth/refresh",
  "POST /auth/password/forgot",
  "POST /auth/password/reset",
]);

function isPublic(req) {
  const path = req.path.replace(/^\/api\/v1/, "") || "/";
  if (PUBLIC.has(`${req.method} ${path}`)) return true;
  if (req.method === "POST" && /\/invites\/[^/]+\/accept$/.test(path)) return true;
  if (path === "/health" || req.path === "/health") return true;
  if (req.path.startsWith("/api/docs")) return true;
  return false;
}

function isGlRowsGet(req) {
  return req.method === "GET" && /\/gl-journal-exports\/[^/]+$/.test(req.path);
}

module.exports = async (req, res, next) => {
  try {
    if (isPublic(req)) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new AppError(401, "UNAUTHENTICATED", "Missing or invalid Authorization header"));
    }

    const token = authHeader.split(" ")[1];

    try {
      const gl = jwt.verify(token, env.JWT_GL_EXPORT_SECRET);
      if (gl && gl.typ === "gl_export") {
        req.restrictedExport = true;
        req.user = {
          id: "restricted_export",
          email: null,
          role: "restricted_export",
          organizationId: null,
          organizationType: "spx",
        };
        if (!isGlRowsGet(req) && req.path !== "/health") {
          return next(new AppError(403, "FIREWALL_VIOLATION", "Restricted export credential cannot call this endpoint."));
        }
        return next();
      }
    } catch (err) {
      if (err.code === "FIREWALL_VIOLATION") return next(err);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch {
      return next(new AppError(401, "UNAUTHENTICATED", "Invalid or expired token"));
    }

    const userId = decoded.userId || decoded.sub;
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user || !user.active) {
      return next(new AppError(401, "UNAUTHENTICATED", "Invalid or expired token"));
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationType: user.organization.type,
      vendorId: user.vendorId,
      organization: user.organization,
      activeProgramId: user.activeProgramId || null,
      tenantOrgId: user.organizationId,
    };
    next();
  } catch (err) {
    next(err);
  }
};
