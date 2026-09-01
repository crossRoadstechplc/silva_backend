const env = require("./env");

function parseOriginList(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function buildAllowedOrigins() {
  const origins = new Set([
    ...parseOriginList(process.env.CORS_ORIGINS),
    ...parseOriginList(process.env.CLIENT_URL),
    env.APP_BASE_URL,
  ]);

  if (env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:3001");
    origins.add("http://127.0.0.1:3000");
  }

  return [...origins].filter(Boolean);
}

const allowedOrigins = buildAllowedOrigins();

const corsOptions = {
  origin(origin, callback) {
    // Same-origin or non-browser clients (curl, Postman)
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, "");
    if (allowedOrigins.includes(normalized)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-App-Base-Url",
    "X-Request-Id",
    "X-Work-Plan-Section",
    "X-Farm-Estate-Id",
  ],
  exposedHeaders: ["X-Request-Id"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

module.exports = { corsOptions, allowedOrigins };
