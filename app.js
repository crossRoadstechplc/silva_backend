const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const requestId = require("./middleware/requestId");
const errorHandler = require("./middleware/errorHandler");
const prisma = require("./config/database");
const env = require("./config/env");
const { corsOptions, allowedOrigins } = require("./config/cors");
const openapi = require("./docs/openapi.json");

const authRoutes = require("./routes/auth.routes");
const programRoutes = require("./routes/program.routes");
const { orgRouter, inviteRouter, userRouter, membershipRouter } = require("./routes/identity.routes");
const { afpRoutes, afeRoutes } = require("./routes/afe.routes");
const {
  workOrderRoutes,
  taskRoutes,
  fieldTicketRoutes,
  paymentRequestRoutes,
  settlementRoutes,
} = require("./routes/execution.routes");
const {
  vendorRoutes,
  contractRoutes,
  scorecardRoutes,
  dashboardRoutes,
  revenueRoutes,
  bvaRoutes,
  reportRoutes,
  notificationRoutes,
  auditRoutes,
  disclosureRoutes,
  accountabilityRoutes,
  schedule3Routes,
  schedule4Routes,
  coaRoutes,
  glRoutes,
  attachmentRoutes,
} = require("./routes/platform.routes");
const { ifsFormRoutes, seasonCalendarRoutes, seasonWindowRoutes } = require("./routes/fieldOps.routes");
const itemRoutes = require("./routes/item.routes");
const exportRoutes = require("./routes/export.routes");
const activityCatalogRoutes = require("./routes/activityCatalog.routes");
const workPlanRoutes = require("./routes/workPlan.routes");
const farmEstateRoutes = require("./routes/farmEstate.routes");
const registrationRequestRoutes = require("./routes/registrationRequest.routes");
const contactRoutes = require("./routes/contact.routes");
const messageRoutes = require("./routes/message.routes");
const adHocRequestRoutes = require("./routes/adHocRequest.routes");
const cropfortRoutes = require("./routes/cropfort");
const setProgramRls = require("./middleware/setProgramRls");
const requireOtpVerified = require("./middleware/requireOtpVerified");

const app = express();

if (env.TRUST_PROXY !== false) {
  app.set("trust proxy", env.TRUST_PROXY);
}

app.use(cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(requestId);

app.get("/health", (req, res) => res.json({ data: { ok: true } }));
app.get("/api/v1/health", (req, res) => res.json({ data: { ok: true } }));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));

const fs = require("fs");
const path = require("path");
app.put("/local-upload/:storageKey", express.raw({ type: "*/*", limit: "25mb" }), (req, res) => {
  const storageKey = decodeURIComponent(req.params.storageKey);
  const dest = path.join(process.cwd(), "uploads", storageKey);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, req.body);
  res.status(204).end();
});
app.get("/local-download/:storageKey", (req, res) => {
  const storageKey = decodeURIComponent(req.params.storageKey);
  const dest = path.join(process.cwd(), "uploads", storageKey);
  if (!fs.existsSync(dest)) return res.status(404).json({ error: { code: "NOT_FOUND", message: "File not found." } });
  res.sendFile(dest);
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/registration-requests", registrationRequestRoutes);
app.use("/api/v1/contact", contactRoutes);
app.use("/api/v1/programs", programRoutes);
app.use("/api/v1/organizations", orgRouter);
app.use("/api/v1/invites", inviteRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/memberships", membershipRouter);

const requireProgramAccess = require("./middleware/requireProgramAccess");
const authenticateJWT = require("./middleware/authenticateJWT");
const programScoped = [authenticateJWT, requireProgramAccess, setProgramRls];
app.use("/api/v1/dashboard", ...programScoped, dashboardRoutes);
app.use("/api/v1/afp-lines", ...programScoped, afpRoutes);
app.use("/api/v1/afes", ...programScoped, afeRoutes);
app.use("/api/v1/work-orders", ...programScoped, workOrderRoutes);
app.use("/api/v1/work-order-tasks", ...programScoped, taskRoutes);
app.use("/api/v1/field-tickets", ...programScoped, fieldTicketRoutes);
app.use("/api/v1/payment-requests", ...programScoped, paymentRequestRoutes);
app.use("/api/v1/owner-settlements", ...programScoped, settlementRoutes);
app.use("/api/v1/vendors", vendorRoutes);
app.use("/api/v1/vendor-contracts", contractRoutes);
app.use("/api/v1/vendor-scorecards", scorecardRoutes);
app.use("/api/v1/budget-vs-actual", ...programScoped, bvaRoutes);
app.use("/api/v1/accountability-matrix", ...programScoped, accountabilityRoutes);
app.use("/api/v1/schedule3-thresholds", ...programScoped, schedule3Routes);
app.use("/api/v1/schedule4-insurance", ...programScoped, schedule4Routes);
app.use("/api/v1/revenue-ledger", ...programScoped, revenueRoutes);
app.use("/api/v1/reports", ...programScoped, reportRoutes);
app.use("/api/v1/notifications", ...programScoped, notificationRoutes);
app.use("/api/v1/audit-log", auditRoutes);
app.use("/api/v1/related-party-disclosures", ...programScoped, disclosureRoutes);
app.use("/api/v1/coa-mapping", coaRoutes);
app.use("/api/v1/gl-journal-exports", ...programScoped, glRoutes);
app.use("/api/v1/attachments", attachmentRoutes);
app.use("/api/v1/ifs-forms", ...programScoped, ifsFormRoutes);
app.use("/api/v1/season-calendars", ...programScoped, seasonCalendarRoutes);
app.use("/api/v1/season-windows", ...programScoped, seasonWindowRoutes);
app.use("/api/v1/activity-catalog", ...programScoped, activityCatalogRoutes);
app.use("/api/v1/work-plans", ...programScoped, workPlanRoutes);
app.use("/api/v1/farm-estates", ...programScoped, farmEstateRoutes);
app.use("/api/v1/items", itemRoutes);
app.use("/api/v1/exports", ...programScoped, exportRoutes);
app.use("/api/v1/messages", ...programScoped, messageRoutes);
app.use("/api/v1/ad-hoc-requests", ...programScoped, adHocRequestRoutes);
const cropfortScoped = [...programScoped, requireOtpVerified];
app.use("/api/v1/cropfort", cropfortScoped, cropfortRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found.", details: [] },
    requestId: req.requestId,
  });
});

app.use(errorHandler);

async function shutdown() {
  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

if (require.main === module) {
  const PORT = env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (${env.NODE_ENV})`);
    console.log(`Trust proxy: ${env.TRUST_PROXY}`);
    if (allowedOrigins.length) {
      console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
    } else {
      console.warn("CORS: no allowed origins configured — set CORS_ORIGINS or APP_BASE_URL");
    }
    if (env.SMTP_HOST && env.SMTP_USER) {
      console.log(`Mail: SMTP ${env.SMTP_USER} @ ${env.SMTP_HOST}:${env.SMTP_PORT}`);
    } else {
      console.warn("Mail: SMTP not configured — add SMTP_* to server/.env");
    }
  });
}

module.exports = app;
