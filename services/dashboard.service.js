const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { money } = require("../utils/helpers");
const { isSilvaRole, isSpxRole, isVendorRole } = require("../utils/roles");
const { notificationJson } = require("../utils/serializers");
const { parseListQuery, meta } = require("../utils/helpers");
const { requireProgramId } = require("./utils/programScope");

function utilizationHealth(percent) {
  if (percent > 100) return "over_budget";
  if (percent >= 85) return "watch";
  return "on_track";
}

async function fxRate(programId) {
  if (!programId) {
    const any = await prisma.platform_config.findFirst();
    return any ? Number(any.fxRateEtbPerUsd) : 57.2;
  }
  const cfg = await prisma.platform_config.findUnique({ where: { programId } });
  return cfg ? Number(cfg.fxRateEtbPerUsd) : 57.2;
}

async function silvaOwnerPayload(year, programId) {
  const afps = await prisma.afp_lines.findMany({ where: { year, programId } });
  const afes = await prisma.afes.findMany({
    where: { programId, silvaApprovalRequired: true, status: "validated" },
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
    const percent = Number(line.budgetAllocatedUsd)
      ? Math.round((committed / Number(line.budgetAllocatedUsd)) * 100)
      : 0;
    bva.push({
      afpLineId: line.id,
      activity: line.activity,
      operatingDiscipline: line.operatingDiscipline,
      utilizationPercent: percent,
      health: utilizationHealth(percent),
    });
  }
  const harvest = await prisma.harvest_kpi_snapshots.findUnique({
    where: { programId_year: { programId, year } },
  });
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
  const reports = await prisma.reports.findMany({
    where: { programId, status: "released", visibleToSilva: true },
  });
  const byDiscipline = {};
  for (const line of bva) {
    const d = line.operatingDiscipline || "General";
    if (!byDiscipline[d]) byDiscipline[d] = [];
    byDiscipline[d].push(line.utilizationPercent);
  }
  const activityCompletionPercentByDiscipline = Object.entries(byDiscipline).map(([operatingDiscipline, vals]) => ({
    operatingDiscipline,
    percent: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
  }));

  return {
    year,
    afpStatus: {
      approved: afps.some((a) => ["approved", "active"].includes(a.status)),
      lineCount: afps.length,
      activityCompletionPercentByDiscipline,
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
    upcomingActions: items.map((i) => ({
      type: "afe_approval",
      entityId: i.id,
      label: `Approve Band ${i.band} AFE`,
      health: i.health,
    })),
    reports: {
      monthlyReady: reports.some((r) => r.type === "monthly"),
      quarterlyBoardPackActive: reports.some((r) => r.type === "quarterly"),
      releasedCount: reports.length,
    },
  };
}

async function buildExceptions(programId) {
  const exceptions = [];
  const year = new Date().getUTCFullYear();
  const fx = await fxRate(programId);
  const lines = await prisma.afp_lines.findMany({ where: { year, programId } });
  for (const line of lines) {
    const afes = await prisma.afes.findMany({ where: { afpLineId: line.id, status: { notIn: ["rejected"] } } });
    const wos = await prisma.work_orders.findMany({ where: { afeId: { in: afes.map((a) => a.id) } } });
    const settlements = await prisma.owner_settlements.findMany({
      where: { workOrderId: { in: wos.map((w) => w.id) }, status: "settled" },
    });
    const actualUsd = settlements.reduce((s, st) => s + Number(st.amountEtb) / fx, 0);
    const percent = Number(line.budgetAllocatedUsd)
      ? Math.round((actualUsd / Number(line.budgetAllocatedUsd)) * 100)
      : 0;
    const health = utilizationHealth(percent);
    if (health !== "on_track") {
      exceptions.push({
        type: health === "over_budget" ? "budget_over" : "budget_watch",
        entityId: line.id,
        label: `${line.id} utilization ${percent}%`,
        health,
      });
    }
  }

  const soon = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const expiring = await prisma.vendors.findMany({
    where: {
      status: "active",
      OR: [
        { insuranceOnFile: false },
        { insuranceExpiry: { lte: soon } },
      ],
    },
  });
  for (const v of expiring) {
    exceptions.push({
      type: "insurance_expiring",
      entityId: v.id,
      label: `${v.name}: insurance missing or expiring`,
      health: "overdue",
    });
  }

  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000);
  const overdueAfe = await prisma.afes.findMany({
    where: { programId, silvaApprovalRequired: true, status: "validated", updatedAt: { lte: fiveDaysAgo } },
  });
  for (const a of overdueAfe) {
    exceptions.push({
      type: "afe_pending",
      entityId: a.id,
      label: `${a.id} pending Silva > 5 days`,
      health: "overdue",
    });
  }

  const awaitingFt = await prisma.field_tickets.count({
    where: { programId, status: { in: ["submitted", "vendor_reviewed"] } },
  });
  if (awaitingFt > 0) {
    exceptions.push({
      type: "ticket_unpaid",
      entityId: "field_ticket_queue",
      label: `${awaitingFt} field ticket(s) awaiting SPX sign-off`,
      health: "watch",
    });
  }

  return exceptions;
}

exports.silvaOwner = async (user, query) => {
  if (!isSilvaRole(user.role) && !isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const year = Number(query.year) || new Date().getUTCFullYear();
  return silvaOwnerPayload(year, requireProgramId(user));
};

exports.spxManagement = async (user, query) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const year = Number(query.year) || new Date().getUTCFullYear();
  const programId = requireProgramId(user);
  const silva = await silvaOwnerPayload(year, programId);
  const awaiting = await prisma.field_tickets.count({
    where: { programId, status: { in: ["submitted", "vendor_reviewed"] } },
  });
  const draft = await prisma.reports.findFirst({
    where: { programId, type: "monthly", status: "draft" },
    orderBy: { generatedAt: "desc" },
  });
  const vendors = await prisma.vendors.findMany({ where: { status: "active" } });
  const soon = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const insuranceAlerts = vendors
    .filter((v) => !v.insuranceOnFile || (v.insuranceExpiry && v.insuranceExpiry <= soon))
    .map((v) => ({
      vendorId: v.id,
      name: v.name,
      insuranceOnFile: v.insuranceOnFile,
      insuranceExpiry: v.insuranceExpiry ? v.insuranceExpiry.toISOString().slice(0, 10) : null,
    }));

  const payload = {
    silva,
    fieldTicketQueue: { awaitingSignOffCount: awaiting },
    exceptions: await buildExceptions(programId),
    vendorInsurance: { alerts: insuranceAlerts },
    reportWorkspace: {
      monthlyDraftId: draft?.id || null,
      monthlyStatus: draft?.status || null,
      needsNarrative: draft ? !draft.narrative : false,
    },
  };
  if (user.role === "spx_principal") {
    const ledger = await prisma.spx_revenue_ledger.findMany({ where: { programId } });
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
  const programId = requireProgramId(user);
  const wos = await prisma.work_orders.findMany({
    where: {
      programId,
      OR: [{ assignedVendorId: user.vendorId }, { assignedVendorId: null }],
    },
  });
  const current = wos.filter((w) => ["issued", "in_progress"].includes(w.status)).length;
  const upcoming = wos.filter((w) => w.status === "draft" || w.status === "issued").length;
  const tasks = await prisma.work_order_tasks.count({
    where: { assigneeUserId: user.id, status: { in: ["open", "in_progress"] } },
  });
  const dueToday = await prisma.work_order_tasks.count({
    where: { assigneeUserId: user.id, dueDate: { lte: new Date() }, status: { in: ["open", "in_progress"] } },
  });
  const drafts = await prisma.field_tickets.count({
    where: { programId, submittedByUserId: user.id, status: "draft" },
  });
  const awaiting = await prisma.field_tickets.count({
    where: { programId, submittedByUserId: user.id, status: { in: ["submitted", "vendor_reviewed"] } },
  });
  const pendingPr = await prisma.payment_requests.count({
    where: { programId, requestedByUserId: user.id, status: { in: ["draft", "submitted"] } },
  });
  const verifiedPr = await prisma.payment_requests.count({
    where: { programId, requestedByUserId: user.id, status: "verified" },
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
    ownScorecard: score
      ? {
          reviewPeriod: score.reviewPeriod,
          overallScore: score.overallScore,
          qualityScore: score.qualityScore,
          timelinessScore: score.timelinessScore,
          costAdherenceScore: score.costAdherenceScore,
        }
      : null,
  };
};

exports.notifications = async (user, query) => {
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = {
    programId: requireProgramId(user),
    OR: [{ recipientUserId: user.id }, { recipientRole: user.role, recipientUserId: null }],
  };
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
