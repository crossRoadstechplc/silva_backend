const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { money } = require("../utils/helpers");
const { isSilvaRole, isSpxRole, isVendorRole } = require("../utils/roles");
const { notificationJson } = require("../utils/serializers");
const { inboxRolesFor } = require("../utils/notificationRoles");
const { parseListQuery, meta } = require("../utils/helpers");
const { requireProgramId } = require("./utils/programScope");
const farmEstateScope = require("./utils/farmEstateScope");

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

async function silvaOwnerPayload(year, programId, farmEstateId = null, ownerOrganizationId = null) {
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
      estimatedCostEtb: money(a.estimatedCostUsd),
      daysOutstanding: days,
      health: days > 5 ? "overdue" : "watch",
    };
  });
  const bva = [];
  for (const line of afps) {
    const related = await prisma.afes.findMany({ where: { afpLineId: line.id } });
    const committed = related.reduce((s, a) => s + Number(a.estimatedCostUsd), 0);
    const budgetEtb = Number(line.budgetAllocatedEtb ?? line.budgetAllocatedUsd);
    const percent = budgetEtb ? Math.round((committed / budgetEtb) * 100) : 0;
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

  const estateMap = await buildEstateMap(programId, farmEstateId, ownerOrganizationId);

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
    estateMap,
  };
}

async function buildEstateMap(programId, farmEstateId, ownerOrganizationId = null) {
  if (farmEstateId) {
    const estate = await prisma.farm_estates.findFirst({
      where: {
        programId,
        status: "active",
        id: farmEstateId,
      },
      include: {
        blocks: { orderBy: { code: "asc" } },
      },
    });
    if (!estate) {
      return buildEstateMap(programId, null, ownerOrganizationId);
    }
    return finalizeEstateMap(estate, estate.blocks);
  }

  const estates = await prisma.farm_estates.findMany({
    where: {
      programId,
      status: "active",
      ...(ownerOrganizationId ? { ownerOrganizationId } : {}),
    },
    include: {
      blocks: { orderBy: { code: "asc" } },
    },
    orderBy: { name: "asc" },
  });
  if (!estates.length) return null;

  if (estates.length === 1) {
    return finalizeEstateMap(estates[0], estates[0].blocks);
  }

  const blocks = estates.flatMap((estate) =>
    estate.blocks.map((block) => ({
      ...block,
      // Keep codes unique across estates on the combined map
      code: `${estate.name?.split(/\s+/)[0] || estate.id.slice(0, 4)}/${block.code}`,
      label: `${estate.name} · ${block.label || block.code}`,
    })),
  );

  const totalAreaHa = estates.reduce((sum, e) => sum + (e.totalAreaHa != null ? Number(e.totalAreaHa) : 0), 0);

  return finalizeEstateMap(
    {
      id: "all",
      name: "All estates",
      location: `${estates.length} farms`,
      totalAreaHa: totalAreaHa || null,
    },
    blocks,
  );
}

async function finalizeEstateMap(estate, rawBlocks) {
  const blockIds = rawBlocks.map((b) => b.id);
  const assignments = blockIds.length
    ? await prisma.work_order_block_assignments.findMany({
        where: { blockId: { in: blockIds } },
        include: {
          workOrder: { select: { id: true, status: true, activity: true, updatedAt: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const latestByBlock = {};
  for (const row of assignments) {
    if (!latestByBlock[row.blockId]) latestByBlock[row.blockId] = row.workOrder;
  }

  const blocks = rawBlocks.map((block) => {
    const wo = latestByBlock[block.id] || null;
    let health = "on_track";
    if (wo) {
      if (["issued", "in_progress"].includes(wo.status)) health = "watch";
      if (wo.status === "draft") health = "watch";
    }
    return {
      id: block.id,
      code: block.code,
      label: block.label || `Block ${block.code}`,
      areaHa: block.areaHa != null ? Number(block.areaHa) : null,
      workOrderId: wo?.id || null,
      workOrderStatus: wo?.status || null,
      activity: wo?.activity || null,
      health,
    };
  });

  const seed = Array.from(String(estate.id)).reduce((s, c) => s + c.charCodeAt(0), 0);
  const climate = {
    tempC: Math.round((18 + (seed % 80) / 10) * 10) / 10,
    humidityPct: 55 + (seed % 30),
    rainfallMm: Math.round((2 + (seed % 50) / 10) * 10) / 10,
  };

  return {
    estateId: estate.id,
    name: estate.name,
    location: estate.location,
    totalAreaHa: estate.totalAreaHa != null ? Number(estate.totalAreaHa) : null,
    climate,
    blocks,
  };
}

async function fieldTicketCountForEstate(programId, farmEstateId, extraWhere = {}) {
  if (!farmEstateId) {
    return prisma.field_tickets.count({
      where: { programId, ...extraWhere },
    });
  }
  const workOrderFilter = await farmEstateScope.workOrderWhereForEstate(farmEstateId, programId);
  return prisma.field_tickets.count({
    where: { programId, ...extraWhere, workOrder: workOrderFilter },
  });
}

async function buildExceptions(programId, farmEstateId = null) {
  const exceptions = [];
  const year = new Date().getUTCFullYear();
  const lines = await prisma.afp_lines.findMany({ where: { year, programId } });
  for (const line of lines) {
    const afes = await prisma.afes.findMany({ where: { afpLineId: line.id, status: { notIn: ["rejected"] } } });
    const wos = await prisma.work_orders.findMany({ where: { afeId: { in: afes.map((a) => a.id) } } });
    const settlements = await prisma.owner_settlements.findMany({
      where: { workOrderId: { in: wos.map((w) => w.id) }, status: "settled" },
    });
    const actualEtb = settlements.reduce((s, st) => s + Number(st.amountEtb), 0);
    const budgetEtb = Number(line.budgetAllocatedEtb ?? line.budgetAllocatedUsd);
    const percent = budgetEtb ? Math.round((actualEtb / budgetEtb) * 100) : 0;
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
  const expiringWhere = { status: "active", OR: [{ insuranceOnFile: false }, { insuranceExpiry: { lte: soon } }] };
  if (farmEstateId) {
    const vendorIds = await farmEstateScope.vendorIdsForEstate(farmEstateId, programId);
    if (vendorIds.length) expiringWhere.id = { in: vendorIds };
    else expiringWhere.id = { in: [] };
  }
  const expiring = await prisma.vendors.findMany({ where: expiringWhere });
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

  const awaitingFt = await fieldTicketCountForEstate(programId, farmEstateId, {
    status: { in: ["submitted", "vendor_reviewed"] },
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
  const farmEstateId = farmEstateScope.parseFarmEstateId(query);
  const ownerOrganizationId = isSilvaRole(user.role) ? user.organizationId : null;
  return silvaOwnerPayload(year, requireProgramId(user), farmEstateId, ownerOrganizationId);
};

exports.spxManagement = async (user, query) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const year = Number(query.year) || new Date().getUTCFullYear();
  const programId = requireProgramId(user);
  const farmEstateId = farmEstateScope.parseFarmEstateId(query);
  const silva = await silvaOwnerPayload(year, programId, farmEstateId);
  const awaiting = await fieldTicketCountForEstate(programId, farmEstateId, {
    status: { in: ["submitted", "vendor_reviewed"] },
  });
  const draft = await prisma.reports.findFirst({
    where: { programId, type: "monthly", status: "draft" },
    orderBy: { generatedAt: "desc" },
  });
  let vendors = await prisma.vendors.findMany({ where: { status: "active" } });
  if (farmEstateId) {
    const vendorIds = await farmEstateScope.vendorIdsForEstate(farmEstateId, programId);
    vendors = vendors.filter((v) => vendorIds.includes(v.id));
  }
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
    exceptions: await buildExceptions(programId, farmEstateId),
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
      invoicedEtb: money(
        ledger
          .filter((l) => l.paymentStatus === "invoiced")
          .reduce((s, l) => s + Number(l.amountEtb || l.amountUsd), 0),
      ),
      paidEtb: money(
        ledger
          .filter((l) => l.paymentStatus === "paid")
          .reduce((s, l) => s + Number(l.amountEtb || l.amountUsd), 0),
      ),
      overdueCount: ledger.filter((l) => l.paymentStatus === "overdue").length,
      yearToDateEtb: money(ledger.reduce((s, l) => s + Number(l.amountEtb || l.amountUsd), 0)),
    };
  }
  return payload;
};

exports.actionQueues = async (user, query = {}) => {
  const programId = requireProgramId(user);
  const farmEstateId = farmEstateScope.parseFarmEstateId(query);
  const items = [];

  if (isSpxRole(user.role)) {
    const planWhere = { programId, status: "submitted" };
    if (farmEstateId) planWhere.farmEstateId = farmEstateId;
    const pendingPlans = await prisma.work_plan_submissions.findMany({
      where: planWhere,
      take: 6,
      orderBy: { submittedAt: "asc" },
      include: { vendor: true },
    });
    for (const wp of pendingPlans) {
      items.push({
        type: "work_plan_review",
        entityId: wp.id,
        label: `Review ${wp.vendor?.name || "vendor"} work plan ${wp.budgetYearLabel}`,
        href: `/execution/work-plans/${wp.id}`,
        health: "watch",
        priority: 0,
      });
    }

    const coreOpWhere = { programId, status: "submitted" };
    if (farmEstateId) coreOpWhere.farmEstateId = farmEstateId;
    const pendingCoreOps = await prisma.activity_requests.findMany({
      where: coreOpWhere,
      take: 8,
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, operationKind: true, plannedStartDate: true },
    });
    for (const req of pendingCoreOps) {
      const kind = req.operationKind === "project" ? "project" : "intervention";
      const start = req.plannedStartDate
        ? ` (starts ${req.plannedStartDate.toISOString().slice(0, 10)})`
        : "";
      items.push({
        type: "core_op_review",
        entityId: req.id,
        label: `Plan ${kind}: ${req.title}${start}`,
        href: kind === "project" ? `/operations/projects?highlight=${req.id}` : `/operations/interventions?highlight=${req.id}`,
        health: "watch",
        priority: 0,
      });
    }

    const pendingAfe = await prisma.afes.findMany({
      where: { programId, status: { in: ["submitted", "validated"] }, silvaApprovalRequired: true },
      take: 8,
      orderBy: { updatedAt: "asc" },
    });
    for (const a of pendingAfe) {
      items.push({
        type: "afe_review",
        entityId: a.id,
        label: `Review AFE ${a.id} — ${a.description.slice(0, 40)}`,
        href: `/planning/afe/${a.id}`,
        health: a.status === "validated" ? "watch" : "overdue",
        priority: 1,
      });
    }

    const ftWhere = { programId, status: { in: ["submitted", "vendor_reviewed"] } };
    if (farmEstateId) {
      ftWhere.workOrder = await farmEstateScope.workOrderWhereForEstate(farmEstateId, programId);
    }
    const awaitingFt = await prisma.field_tickets.findMany({
      where: ftWhere,
      take: 8,
      orderBy: { updatedAt: "asc" },
    });
    for (const ft of awaitingFt) {
      items.push({
        type: "field_ticket_validate",
        entityId: ft.id,
        label: `Validate field ticket ${ft.id}`,
        href: `/execution/field-tickets/${ft.id}`,
        health: "watch",
        priority: 2,
      });
    }
  }

  if (isSilvaRole(user.role)) {
    const pending = await prisma.afes.findMany({
      where: { programId, silvaApprovalRequired: true, status: "validated" },
      take: 10,
      orderBy: { updatedAt: "asc" },
    });
    for (const a of pending) {
      const days = Math.floor((Date.now() - new Date(a.updatedAt).getTime()) / 86400000);
      items.push({
        type: "afe_approval",
        entityId: a.id,
        label: `Approve Band ${a.band} AFE ${a.id}`,
        href: `/planning/afe/${a.id}`,
        health: days > 5 ? "overdue" : "watch",
        priority: 1,
      });
    }
  }

  if (isVendorRole(user.role) && (user.role === "vendor_admin" || user.role === "vendor_manager")) {
    const draftPlanWhere = { programId, vendorId: user.vendorId, status: { in: ["draft", "revision_requested"] } };
    if (farmEstateId) draftPlanWhere.farmEstateId = farmEstateId;
    const draftPlans = await prisma.work_plan_submissions.findMany({
      where: draftPlanWhere,
      take: 4,
    });
    for (const wp of draftPlans) {
      items.push({
        type: "work_plan_draft",
        entityId: wp.id,
        label: `Complete work plan ${wp.budgetYearLabel}`,
        href: `/execution/work-plans/${wp.id}`,
        health: "watch",
        priority: 0,
      });
    }
  }

  if (isVendorRole(user.role)) {
    const woWhere = {
      programId,
      status: { in: ["issued", "in_progress"] },
      OR: [{ assignedVendorId: user.vendorId }, { assignedVendorId: null }],
    };
    if (farmEstateId) {
      const estateFilter = await farmEstateScope.workOrderWhereForEstate(farmEstateId, programId);
      farmEstateScope.mergeEstateFilter(woWhere, estateFilter);
    }
    const activeWo = await prisma.work_orders.findMany({
      where: woWhere,
      take: 6,
    });
    for (const wo of activeWo) {
      items.push({
        type: "work_order_execute",
        entityId: wo.id,
        label: `Execute ${wo.id}: ${wo.activity.slice(0, 36)}`,
        href: `/execution/work-orders/${wo.id}`,
        health: "on_track",
        priority: 1,
      });
    }

    const draftFtWhere = { programId, submittedByUserId: user.id, status: "draft" };
    if (farmEstateId) {
      draftFtWhere.workOrder = await farmEstateScope.workOrderWhereForEstate(farmEstateId, programId);
    }
    const draftFt = await prisma.field_tickets.findMany({
      where: draftFtWhere,
      take: 6,
    });
    for (const ft of draftFt) {
      items.push({
        type: "field_ticket_draft",
        entityId: ft.id,
        label: `Submit field ticket ${ft.id}`,
        href: `/execution/field-tickets/${ft.id}`,
        health: "watch",
        priority: 2,
      });
    }
  }

  items.sort((a, b) => a.priority - b.priority);
  return { items: items.slice(0, 12) };
};

exports.vendorField = async (user, query = {}) => {
  if (!isVendorRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const programId = requireProgramId(user);
  const farmEstateId = farmEstateScope.parseFarmEstateId(query);
  const woWhere = {
    programId,
    OR: [{ assignedVendorId: user.vendorId }, { assignedVendorId: null }],
  };
  if (farmEstateId) {
    const estateFilter = await farmEstateScope.workOrderWhereForEstate(farmEstateId, programId);
    farmEstateScope.mergeEstateFilter(woWhere, estateFilter);
  }
  const wos = await prisma.work_orders.findMany({ where: woWhere });
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
  const inboxRoles = inboxRolesFor(user.role);
  const where = {
    programId: requireProgramId(user),
    OR: [
      { recipientUserId: user.id },
      { recipientRole: { in: inboxRoles }, recipientUserId: null },
    ],
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
