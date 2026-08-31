const env = require("../config/env");

function normalizeBase(url) {
  if (!url) return null;
  return String(url).trim().replace(/\/$/, "");
}

function originFromReferer(referer) {
  if (!referer) return null;
  try {
    const parsed = new URL(referer);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/**
 * Public frontend URL for links in emails (invites, activation).
 * Set APP_BASE_URL on the server for production (e.g. https://app.yourdomain.com).
 * In development, falls back to the browser Origin / X-App-Base-Url header.
 */
function resolveAppBaseUrl(req) {
  const configured = normalizeBase(env.APP_BASE_URL);

  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) {
    return configured;
  }

  if (req) {
    const fromHeader = normalizeBase(req.get("x-app-base-url"));
    if (fromHeader) return fromHeader;

    const origin = normalizeBase(req.get("origin"));
    if (origin) return origin;

    const fromReferer = originFromReferer(req.get("referer"));
    if (fromReferer) return fromReferer;
  }

  return configured || "http://localhost:3000";
}

module.exports = { resolveAppBaseUrl, normalizeBase };
