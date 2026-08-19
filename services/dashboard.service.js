const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { money } = require("../utils/helpers");
const { isSilvaRole, isSpxRole, isVendorRole } = require("../utils/roles");
const { notificationJson } = require("../utils/serializers");
const { parseListQuery, meta } = require("../utils/helpers");

function utilizationHealth(percent) {
  if (percent > 100) return "over_budget";
  if (percent >= 85) return "watch";
  return "on_track";
}

async function fxRate() {
  const cfg = await prisma.platform_config.findUnique({ where: { id: "default" } });
  return cfg ? Number(cfg.fxRateEtbPerUsd) : 57.2;
}

async function silvaOwnerPayload(year) {
  const afps = await prisma.afp_lines.findMany({ where: { year } });
  const afes = await prisma.afes.findMany({
    where: { silvaApprovalRequired: true, status: "validated" },
  });
  const now = Date.now();
  const items = afes.map((a) => {
    const days = Math.floor((now - new Date(a.createdAt).getTime()) / 86400000);
    return {
      id: a.id,
      band: a.band,
      estimatedCostUsd: money(a.estimatedCostUsd),
      daysOutstanding: days,
      health: days > 5 ? "overdue" : "watch",
    };
  });
  const bva = [];
  for (const line of afps) {
    const related = await prisma.afes.findMany({ where: { afpLineId: line.id } });
    const committed = related.reduce((s, a) => s + Number(a.estimatedCostUsd), 0);
    const percent = Number(line.budgetAllocatedUsd) ? Math.round((committed / Number(line.budgetAllocatedUsd)) * 100) : 0;
    bva.push({ afpLineId: line.id, utilizationPercent: percent, health: utilizationHealth(percent) });
  }
  const harvest = await prisma.harvest_kpi_snapshots.findUnique({ where: { year } });
  const scorecards = await prisma.vendor_scorecards.findMany({ orderBy: { createdAt: "desc" } });
  const latestByVendor = {};
  for (const s of scorecards) {
    if (!latestByVendor[s.vendorId]) latestByVendor[s.vendorId] = s;
  }
  const summaries = [];
  for (const [vendorId, s] of Object.entries(latestByVendor)) {
    const v = await prisma.vendors.findUnique({ where: { id: vendorId } });
    summaries.push({ vendorId, name: v?.name || vendorId, overallScore: s.overallScore });
  }
  const reports = await prisma.reports.findMany({ where: { status: "released", visibleToSilva: true } });
  return {
    year,
    afpStatus: {
      approved: afps.some((a) => ["approved", "active"].includes(a.status)),
      activityCompletionPercentByDiscipline: [
        { operatingDiscipline: "Agronomic Operations", percent: bva[0]?.utilizationPercent || 0 },
      ],
    },
    afePipeline: {
      pendingSilvaApprovalCount: items.length,
      oldestDaysOutstanding: items.reduce((m, i) => Math.max(m, i.daysOutstanding), 0),
      items,
    },
    budgetVsActual: { lines: bva },
    harvestKpis: {
      pickerProductivityCurrent: harvest ? Number(harvest.pickerProductivityCurrent) : 0,
      yieldTrendVsBaselinePercent: harvest ? Number(harvest.yieldTrendVsBaselinePercent) : 0,
    },
    vendorPerformance: {
      belowThresholdCount: summaries.filter((s) => s.overallScore < 70).length,
      summaries,
    },
    upcomingActions: items.map((i) => ({ type: "afe_approval", entityId: i.id, label: `Approve Band ${i.band} AFE` })),
    reports: {
      monthlyReady: reports.some((r) => r.type === "monthly"),
      quarterlyBoardPackActive: reports.some((r) => r.type === "quarterly"),
    },
  };
}

exports.silvaOwner = async (user, query) => {
  if (!isSilvaRole(user.role) && !isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const year = Number(query.year) || new Date().getUTCFullYear();
  return silvaOwnerPayload(year);
};

exports.spxManagement = async (user, query) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const year = Number(query.year) || new Date().getUTCFullYear();
  const silva = await silvaOwnerPayload(year);
  const awaiting = await prisma.field_tickets.count({ where: { status: { in: ["submitted", "vendor_reviewed"] } } });
  const draft = await prisma.reports.findFirst({ where: { type: "monthly", status: "draft" }, orderBy: { generatedAt: "desc" } });
  const payload = {
    silva,
    fieldTicketQueue: { awaitingSignOffCount: awaiting },
    exceptions: [],
    reportWorkspace: {
      monthlyDraftId: draft?.id || null,
      monthlyStatus: draft?.status || null,
    },
  };
  if (user.role === "spx_principal") {
    const ledger = await prisma.spx_revenue_ledger.findMany();
    payload.revenueLedgerSummary = {
      invoicedUsd: money(ledger.filter((l) => l.paymentStatus === "invoiced").reduce((s, l) => s + Number(l.amountUsd), 0)),
      paidUsd: money(ledger.filter((l) => l.paymentStatus === "paid").reduce((s, l) => s + Number(l.amountUsd), 0)),
      overdueCount: ledger.filter((l) => l.paymentStatus === "overdue").length,
      yearToDateUsd: money(ledger.reduce((s, l) => s + Number(l.amountUsd), 0)),
    };
  }
  return payload;
};

exports.vendorField = async (user) => {
  if (!isVendorRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const wos = await prisma.work_orders.findMany({
    where: { OR: [{ assignedVendorId: user.vendorId }, { assignedVendorId: null }] },
  });
  const current = wos.filter((w) => ["issued", "in_progress"].includes(w.status)).length;
  const upcoming = wos.filter((w) => w.status === "draft").length;
  const tasks = await prisma.work_order_tasks.count({
    where: { assigneeUserId: user.id, status: { in: ["open", "in_progress"] } },
  });
  const dueToday = await prisma.work_order_tasks.count({
    where: { assigneeUserId: user.id, dueDate: { lte: new Date() }, status: { in: ["open", "in_progress"] } },
  });
  const drafts = await prisma.field_tickets.count({ where: { submittedByUserId: user.id, status: "draft" } });
  const awaiting = await prisma.field_tickets.count({
    where: { submittedByUserId: user.id, status: { in: ["submitted", "vendor_reviewed"] } },
  });
  const pendingPr = await prisma.payment_requests.count({
    where: { requestedByUserId: user.id, status: { in: ["draft", "submitted"] } },
  });
  const verifiedPr = await prisma.payment_requests.count({
    where: { requestedByUserId: user.id, status: "verified" },
  });
  const score = await prisma.vendor_scorecards.findFirst({
    where: { vendorId: user.vendorId },
    orderBy: { createdAt: "desc" },
  });
  return {
    assignedWorkOrders: { currentCount: current, upcomingCount: upcoming },
    myTasks: { openCount: tasks, dueTodayCount: dueToday },
    fieldTickets: { draftCount: drafts, awaitingValidationCount: awaiting },
    paymentRequests: { pendingCount: pendingPr, verifiedCount: verifiedPr },
    ownScorecard: score ? { reviewPeriod: score.reviewPeriod, overallScore: score.overallScore } : null,
  };
};

exports.notifications = async (user, query) => {
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = { OR: [{ recipientUserId: user.id }, { recipientRole: user.role, recipientUserId: null }] };
  if (query.acknowledged === "true") where.acknowledged = true;
  if (query.acknowledged === "false") where.acknowledged = false;
  if (query.triggerType) where.triggerType = query.triggerType;
  const [rows, total] = await Promise.all([
    prisma.notifications.findMany({ where, skip, take, orderBy: { sentAt: "desc" } }),
    prisma.notifications.count({ where }),
  ]);
  return { items: rows.map(notificationJson), meta: meta(page, pageSize, total) };
};

exports.fxRate = fxRate;
exports.utilizationHealth = utilizationHealth;
