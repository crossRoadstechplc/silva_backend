const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const requestId = require("./middleware/requestId");
const errorHandler = require("./middleware/errorHandler");
const prisma = require("./config/database");
const env = require("./config/env");
const openapi = require("./docs/openapi.json");

const authRoutes = require("./routes/auth.routes");
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

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(requestId);

app.get("/health", (req, res) => res.json({ data: { ok: true } }));
app.get("/api/v1/health", (req, res) => res.json({ data: { ok: true } }));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/organizations", orgRouter);
app.use("/api/v1/invites", inviteRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/memberships", membershipRouter);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/afp-lines", afpRoutes);
app.use("/api/v1/afes", afeRoutes);
app.use("/api/v1/work-orders", workOrderRoutes);
app.use("/api/v1/work-order-tasks", taskRoutes);
app.use("/api/v1/field-tickets", fieldTicketRoutes);
app.use("/api/v1/payment-requests", paymentRequestRoutes);
app.use("/api/v1/owner-settlements", settlementRoutes);
app.use("/api/v1/vendors", vendorRoutes);
app.use("/api/v1/vendor-contracts", contractRoutes);
app.use("/api/v1/vendor-scorecards", scorecardRoutes);
app.use("/api/v1/budget-vs-actual", bvaRoutes);
app.use("/api/v1/accountability-matrix", accountabilityRoutes);
app.use("/api/v1/schedule3-thresholds", schedule3Routes);
app.use("/api/v1/schedule4-insurance", schedule4Routes);
app.use("/api/v1/revenue-ledger", revenueRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/audit-log", auditRoutes);
app.use("/api/v1/related-party-disclosures", disclosureRoutes);
app.use("/api/v1/coa-mapping", coaRoutes);
app.use("/api/v1/gl-journal-exports", glRoutes);
app.use("/api/v1/attachments", attachmentRoutes);

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
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
