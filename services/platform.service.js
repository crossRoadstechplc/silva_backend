const jwt = require("jsonwebtoken");
const prisma = require("../config/database");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { uuid, nextTextId } = require("../utils/ids");
const { decimal, money, parseListQuery, meta, isoDate } = require("../utils/helpers");
const { revenueJson, reportJson, notificationJson, auditJson } = require("../utils/serializers");
const { inboxRolesFor } = require("../utils/notificationRoles");
const { isVendorRole, isSilvaRole, isSpxRole } = require("../utils/roles");
const { signedUploadUrl, signedDownloadUrl } = require("../config/s3");
const dashboard = require("./dashboard.service");
const { scopedWhere, programCreateData, requireProgramId } = require("./utils/programScope");
const notify = require("./workflowNotifications.service");

exports.listRevenue = async (query, user) => {
  if (user.role !== "spx_principal") {
    throw new AppError(403, "FIREWALL_VIOLATION", "SPX revenue ledger is not visible to this role.");
  }
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = scopedWhere(user);
  if (query.period) where.period = query.period;
  if (query.tier) where.tier = query.tier;
  if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
  const [rows, total] = await Promise.all([
    prisma.spx_revenue_ledger.findMany({ where, skip, take, orderBy: { invoiceDate: "desc" } }),
    prisma.spx_revenue_ledger.count({ where }),
  ]);
  return { items: rows.map(revenueJson), meta: meta(page, pageSize, total) };
};

exports.createRevenue = async (dto, user) => {
  if (user.role !== "spx_principal") {
    throw new AppError(403, "FIREWALL_VIOLATION", "SPX revenue ledger is not visible to this role.");
  }
  const id = await nextTextId("inv", "INV");
  const row = await prisma.spx_revenue_ledger.create({
    data: programCreateData(user, {
      id,
      period: dto.period,
      tier: dto.tier,
      feeDescription: dto.feeDescription,
      amountUsd: decimal(dto.amountUsd),
      amountEtb: decimal(dto.amountEtb || 0),
      invoiceDate: new Date(`${dto.invoiceDate}T00:00:00.000Z`),
      paymentStatus: dto.paymentStatus || "invoiced",
    }),
  });
  return revenueJson(row);
};

exports.findRevenue = async (id, user) => {
  if (user.role !== "spx_principal") {
    throw new AppError(403, "FIREWALL_VIOLATION", "SPX revenue ledger is not visible to this role.");
  }
  const row = await prisma.spx_revenue_ledger.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Ledger entry not found.");
  return revenueJson(row);
};

exports.updateRevenue = async (id, dto, user) => {
  if (user.role !== "spx_principal") {
    throw new AppError(403, "FIREWALL_VIOLATION", "SPX revenue ledger is not visible to this role.");
  }
  const row = await prisma.spx_revenue_ledger.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Ledger entry not found.");
  const updated = await prisma.spx_revenue_ledger.update({
    where: { id },
    data: {
      feeDescription: dto.feeDescription ?? row.feeDescription,
      amountUsd: dto.amountUsd !== undefined ? decimal(dto.amountUsd) : undefined,
      amountEtb: dto.amountEtb !== undefined ? decimal(dto.amountEtb) : undefined,
      paymentStatus: dto.paymentStatus ?? row.paymentStatus,
    },
  });
  return revenueJson(updated);
};

exports.exportRevenue = async (id, user) => {
  if (user.role !== "spx_principal") {
    throw new AppError(403, "FIREWALL_VIOLATION", "SPX revenue ledger is not visible to this role.");
  }
  const row = await prisma.spx_revenue_ledger.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Ledger entry not found.");
  return {
    exportId: uuid("rlex"),
    downloadUrl: `https://files.example/restricted/${id}.csv`,
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  };
};

exports.budgetVsActual = async (query, user) => {
  if (isVendorRole(user.role)) throw new AppError(403, "FORBIDDEN", "Vendors cannot access budget vs actual.");
  const year = Number(query.year) || new Date().getUTCFullYear();
  const programId = requireProgramId(user);
  const { page, pageSize, skip, take } = parseListQuery({ ...query, pageSize: query.pageSize || 50 });
  const where = scopedWhere(user, { year });
  const [lines, total] = await Promise.all([
    prisma.afp_lines.findMany({ where, skip, take, orderBy: { id: "asc" } }),
    prisma.afp_lines.count({ where }),
  ]);
  const fx = await dashboard.fxRate(programId);
  const items = [];
  for (const line of lines) {
    const afes = await prisma.afes.findMany({
      where: { programId, afpLineId: line.id, status: { notIn: ["rejected"] } },
    });
    const committedUsd = afes.reduce((s, a) => s + Number(a.estimatedCostUsd), 0);
    const wos = await prisma.work_orders.findMany({
      where: { programId, afeId: { in: afes.map((a) => a.id) } },
    });
    const settlements = await prisma.owner_settlements.findMany({
      where: { programId, workOrderId: { in: wos.map((w) => w.id) }, status: "settled" },
    });
    const actualUsd = settlements.reduce((s, st) => s + Number(st.amountEtb) / fx, 0);
    const utilizationPercent = Number(line.budgetAllocatedUsd)
      ? Math.round((actualUsd / Number(line.budgetAllocatedUsd)) * 100)
      : 0;
    const schedules = await prisma.afp_line_schedules.findMany({
      where: { programId, afpLineId: line.id, year: line.year },
    });
    const plannedUsd = schedules.reduce((s, r) => s + Number(r.plannedCostUsd || r.plannedCostEtb) / fx, 0);
    const plannedEtb = schedules.reduce((s, r) => s + Number(r.plannedCostEtb), 0);
    items.push({
      afpLineId: line.id,
      activity: line.activity,
      budgetAllocatedUsd: money(line.budgetAllocatedUsd),
      budgetAllocatedEtb: line.budgetAllocatedEtb != null ? money(line.budgetAllocatedEtb) : null,
      plannedUsd: money(plannedUsd || Number(line.budgetAllocatedEtb || 0) / fx),
      plannedEtb: money(plannedEtb || Number(line.budgetAllocatedEtb || 0)),
      committedUsd: money(committedUsd),
      actualUsd: money(actualUsd),
      utilizationPercent,
      health: dashboard.utilizationHealth(utilizationPercent),
    });
  }
  return { items, meta: meta(page, pageSize, total) };
};

exports.budgetSummary = async (query, user) => {
  if (isVendorRole(user.role)) throw new AppError(403, "FORBIDDEN", "Vendors cannot access budget vs actual.");
  const year = Number(query.year) || new Date().getUTCFullYear();
  const { items } = await exports.budgetVsActual({ year, pageSize: 100 }, user);
  const fx = await dashboard.fxRate(requireProgramId(user));
  return {
    year,
    totalBudgetUsd: money(items.reduce((s, i) => s + i.budgetAllocatedUsd, 0)),
    totalActualUsd: money(items.reduce((s, i) => s + i.actualUsd, 0)),
    watchCount: items.filter((i) => i.health === "watch").length,
    overBudgetCount: items.filter((i) => i.health === "over_budget").length,
    fxRateEtbPerUsd: fx,
  };
};

exports.patchBudgetConfig = async (dto, user) => {
  if (user.role !== "spx_principal") throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const programId = requireProgramId(user);
  await prisma.platform_config.upsert({
    where: { programId },
    create: { programId, fxRateEtbPerUsd: decimal(dto.fxRateEtbPerUsd), enhancedGovernanceActive: true },
    update: { fxRateEtbPerUsd: decimal(dto.fxRateEtbPerUsd) },
  });
  return exports.budgetSummary({ year: new Date().getUTCFullYear() }, user);
};

exports.listReports = async (query, user) => {
  if (isVendorRole(user.role)) throw new AppError(403, "FORBIDDEN", "Vendors cannot access reports.");
  const { page, pageSize, skip, take, statuses } = parseListQuery(query);
  const where = scopedWhere(user);
  if (isSilvaRole(user.role)) {
    where.status = "released";
    where.visibleToSilva = true;
  }
  if (query.type) where.type = query.type;
  if (statuses.length && !isSilvaRole(user.role)) where.status = { in: statuses };
  if (query.period) where.period = query.period;
  const [rows, total] = await Promise.all([
    prisma.reports.findMany({ where, skip, take, orderBy: { generatedAt: "desc" } }),
    prisma.reports.count({ where }),
  ]);
  return { items: rows.map((r) => reportJson(r)), meta: meta(page, pageSize, total) };
};

exports.generateReport = async (type, dto, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const programId = requireProgramId(user);
  if (type === "quarterly") {
    const cfg = await prisma.platform_config.findUnique({ where: { programId } });
    if (cfg && !cfg.enhancedGovernanceActive) {
      throw new AppError(422, "BUSINESS_RULE_VIOLATION", "Quarterly reports require Enhanced Governance.");
    }
  }
  const period = dto.period || dto.periodStart || new Date().toISOString().slice(0, 7);
  const { items } = await exports.budgetVsActual({ year: Number(String(period).slice(0, 4)), pageSize: 100 }, user);
  const row = await prisma.reports.create({
    data: programCreateData(user, {
      id: `rpt_${String(period).replace(/-/g, "_")}_${type}`,
      type,
      period: String(period),
      status: "draft",
      sections: { budget_vs_actual: items },
    }),
  });
  await notify.reportGenerated(row);
  return reportJson(row);
};

exports.findReport = async (id, user) => {
  const row = await prisma.reports.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Report not found.");
  if (isSilvaRole(user.role) && !(row.status === "released" && row.visibleToSilva)) {
    throw new AppError(404, "NOT_FOUND", "Report not found.");
  }
  if (isVendorRole(user.role)) throw new AppError(403, "FORBIDDEN", "Vendors cannot access reports.");
  const sections = row.sections
    ? Object.entries(row.sections).map(([key, payload]) => ({
        key,
        title: key.replace(/_/g, " "),
        payload,
      }))
    : [];
  return reportJson(row, { sections });
};

exports.patchNarrative = async (id, narrative, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const row = await prisma.reports.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Report not found.");
  const updated = await prisma.reports.update({ where: { id }, data: { narrative } });
  return reportJson(updated);
};

exports.releaseReport = async (id, user) => {
  if (!["spx_principal", "spx_account_handler"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const row = await prisma.reports.findFirst({ where: scopedWhere(user, { id }) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Report not found.");
  if (row.status === "released") return reportJson(row);
  if (!row.narrative) {
    throw new AppError(422, "BUSINESS_RULE_VIOLATION", "Cannot release a report with empty narrative.");
  }
  const updated = await prisma.reports.update({
    where: { id },
    data: { status: "released", visibleToSilva: true, releasedAt: new Date(), releasedByUserId: user.id },
  });
  await notify.reportReleased(updated);
  return reportJson(updated);
};

exports.listCoa = async (user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const rows = await prisma.coa_mapping.findMany();
  return rows;
};

exports.createCoa = async (dto, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  return prisma.coa_mapping.create({
    data: { id: uuid("coa"), sourceAccount: dto.sourceAccount, glAccount: dto.glAccount, description: dto.description || "" },
  });
};

exports.patchCoa = async (id, dto, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const row = await prisma.coa_mapping.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Mapping not found.");
  return prisma.coa_mapping.update({
    where: { id },
    data: {
      sourceAccount: dto.sourceAccount ?? row.sourceAccount,
      glAccount: dto.glAccount ?? row.glAccount,
      description: dto.description ?? row.description,
    },
  });
};

exports.listGlExports = async (user) => {
  if (user.role === "restricted_export") {
    throw new AppError(403, "FIREWALL_VIOLATION", "Restricted export credential can only fetch a single export.");
  }
  if (!isSpxRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const rows = await prisma.gl_journal_exports.findMany({
    where: scopedWhere(user),
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    period: r.period,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    restrictedAccessTokenIssued: r.restrictedAccessTokenIssued,
  }));
};

exports.generateGlExport = async (dto, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const programId = requireProgramId(user);
  const settlements = await prisma.owner_settlements.findMany({
    where: { programId, status: "settled" },
  });
  const mappings = await prisma.coa_mapping.findMany();
  const account = mappings[0]?.glAccount || "6100-Field Operations";
  const exp = await prisma.gl_journal_exports.create({
    data: programCreateData(user, {
      id: uuid("glx"),
      period: dto.period,
      status: "ready",
      restrictedAccessTokenIssued: true,
      lines: {
        create: settlements.map((s) => ({
          id: uuid("gll"),
          date: s.dateAuthorized || s.createdAt,
          account,
          debitEtb: s.amountEtb,
          creditEtb: decimal(0),
          memo: `${s.id} ${s.payee}`,
        })),
      },
    }),
  });
  return {
    id: exp.id,
    period: exp.period,
    status: exp.status,
    createdAt: exp.createdAt.toISOString(),
    restrictedAccessTokenIssued: true,
  };
};

exports.findGlExport = async (id, user, restricted) => {
  const isRestricted = restricted || user.role === "restricted_export";
  const row = isRestricted
    ? await prisma.gl_journal_exports.findUnique({ where: { id }, include: { lines: true } })
    : await prisma.gl_journal_exports.findFirst({
        where: scopedWhere(user, { id }),
        include: { lines: true },
      });
  if (!row) throw new AppError(404, "NOT_FOUND", "Export not found.");

  const lineRows = row.lines.map((l) => ({
    date: isoDate(l.date),
    account: l.account,
    debitEtb: money(l.debitEtb),
    creditEtb: money(l.creditEtb),
    memo: l.memo,
  }));

  if (isRestricted) {
    return {
      id: row.id,
      period: row.period,
      rows: lineRows,
    };
  }
  if (isSilvaRole(user.role) || isVendorRole(user.role)) {
    throw new AppError(403, "FIREWALL_VIOLATION", "GL journal export is only available via restricted export credential or SPX.");
  }
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  return {
    id: row.id,
    period: row.period,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    restrictedAccessTokenIssued: row.restrictedAccessTokenIssued,
    rows: lineRows,
  };
};

exports.listAccountability = async (user) =>
  prisma.accountability_matrix.findMany({
    where: scopedWhere(user),
    orderBy: { operatingDiscipline: "asc" },
  });

exports.createAccountability = async (dto, user) => {
  if (user.role !== "spx_principal") throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const programId = requireProgramId(user);
  const operatingDiscipline = String(dto.operatingDiscipline || "").trim();
  if (!operatingDiscipline) throw new AppError(400, "VALIDATION_ERROR", "operatingDiscipline is required.");
  const existing = await prisma.accountability_matrix.findUnique({
    where: { programId_operatingDiscipline: { programId, operatingDiscipline } },
  });
  if (existing) throw new AppError(409, "CONFLICT", "Matrix row already exists for this discipline.");
  return prisma.accountability_matrix.create({
    data: {
      programId,
      operatingDiscipline,
      executeRole: dto.executeRole || "Execution partner",
      validateRole: dto.validateRole || "SPX",
      decideRole: dto.decideRole || "SPX",
      authorRole: dto.authorRole || "SPX",
      schedule3Ref: dto.schedule3Ref || "Schedule 3",
    },
  });
};

exports.patchAccountability = async (operatingDiscipline, dto, user) => {
  if (user.role !== "spx_principal") throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const programId = requireProgramId(user);
  const decoded = decodeURIComponent(operatingDiscipline);
  const existing = await prisma.accountability_matrix.findUnique({
    where: { programId_operatingDiscipline: { programId, operatingDiscipline: decoded } },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Matrix row not found.");
  return prisma.accountability_matrix.update({
    where: { programId_operatingDiscipline: { programId, operatingDiscipline: decoded } },
    data: {
      executeRole: dto.executeRole ?? existing.executeRole,
      validateRole: dto.validateRole ?? existing.validateRole,
      decideRole: dto.decideRole ?? existing.decideRole,
      authorRole: dto.authorRole ?? existing.authorRole,
      schedule3Ref: dto.schedule3Ref ?? existing.schedule3Ref,
    },
  });
};

exports.listSchedule3 = async (user) => {
  const rows = await prisma.schedule3_thresholds.findMany({
    where: scopedWhere(user),
    orderBy: { minValueUsd: "asc" },
  });
  return rows.map((r) => ({
    band: r.band,
    minValueUsd: Number(r.minValueUsd),
    maxValueUsd: r.maxValueUsd === null ? null : Number(r.maxValueUsd),
    spxAuthority: r.spxAuthority,
    silvaAuthority: r.silvaAuthority,
    effectiveYear: r.effectiveYear,
  }));
};

exports.patchSchedule3 = async (band, dto, user) => {
  if (!["spx_principal", "system_admin"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX can configure Schedule 3 spend bands.");
  }
  const programId = requireProgramId(user);
  const existing = await prisma.schedule3_thresholds.findUnique({
    where: { programId_band: { programId, band } },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Band not found.");
  const updated = await prisma.schedule3_thresholds.update({
    where: { programId_band: { programId, band } },
    data: {
      minValueUsd: dto.minValueUsd !== undefined ? decimal(dto.minValueUsd) : undefined,
      maxValueUsd: dto.maxValueUsd === undefined ? undefined : dto.maxValueUsd === null ? null : decimal(dto.maxValueUsd),
      spxAuthority: dto.spxAuthority ?? existing.spxAuthority,
      silvaAuthority: dto.silvaAuthority ?? existing.silvaAuthority,
      effectiveYear: dto.effectiveYear ?? existing.effectiveYear,
    },
  });
  return {
    band: updated.band,
    minValueUsd: Number(updated.minValueUsd),
    maxValueUsd: updated.maxValueUsd === null ? null : Number(updated.maxValueUsd),
    spxAuthority: updated.spxAuthority,
    silvaAuthority: updated.silvaAuthority,
    effectiveYear: updated.effectiveYear,
  };
};

exports.listSchedule4 = async (user) => {
  const rows = await prisma.schedule4_insurance.findMany({ where: scopedWhere(user) });
  return rows.map((r) => ({
    id: r.id,
    party: r.party,
    coverageType: r.coverageType,
    minimumCoverageUsd: Number(r.minimumCoverageUsd),
    beneficiary: r.beneficiary,
  }));
};

exports.patchSchedule4 = async (ruleId, dto, user) => {
  if (user.role !== "spx_principal") throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const existing = await prisma.schedule4_insurance.findFirst({ where: scopedWhere(user, { id: ruleId }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Rule not found.");
  const updated = await prisma.schedule4_insurance.update({
    where: { id: ruleId },
    data: {
      party: dto.party ?? existing.party,
      coverageType: dto.coverageType ?? existing.coverageType,
      minimumCoverageUsd: dto.minimumCoverageUsd !== undefined ? decimal(dto.minimumCoverageUsd) : undefined,
      beneficiary: dto.beneficiary ?? existing.beneficiary,
    },
  });
  return {
    id: updated.id,
    party: updated.party,
    coverageType: updated.coverageType,
    minimumCoverageUsd: Number(updated.minimumCoverageUsd),
    beneficiary: updated.beneficiary,
  };
};

exports.listDisclosures = async (query, user) => {
  if (isVendorRole(user.role)) throw new AppError(403, "FORBIDDEN", "Vendors cannot access related-party disclosures.");
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = scopedWhere(user);
  const [rows, total] = await Promise.all([
    prisma.related_party_disclosures.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.related_party_disclosures.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      party: r.party,
      relationship: r.relationship,
      period: r.period,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    })),
    meta: meta(page, pageSize, total),
  };
};

exports.createDisclosure = async (dto, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const row = await prisma.related_party_disclosures.create({
    data: programCreateData(user, {
      id: uuid("rpd"),
      party: dto.party,
      relationship: dto.relationship,
      period: dto.period,
      notes: dto.notes ?? null,
    }),
  });
  return {
    id: row.id,
    party: row.party,
    relationship: row.relationship,
    period: row.period,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
};

exports.patchDisclosure = async (id, dto, user) => {
  if (!isSpxRole(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const existing = await prisma.related_party_disclosures.findFirst({ where: scopedWhere(user, { id }) });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Disclosure not found.");
  const row = await prisma.related_party_disclosures.update({
    where: { id },
    data: {
      party: dto.party ?? existing.party,
      relationship: dto.relationship ?? existing.relationship,
      period: dto.period ?? existing.period,
      notes: dto.notes === undefined ? undefined : dto.notes,
    },
  });
  return {
    id: row.id,
    party: row.party,
    relationship: row.relationship,
    period: row.period,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
};

exports.listNotifications = async (user, query) => {
  const { page, pageSize, skip, take } = parseListQuery(query);
  const programId = requireProgramId(user);
  const inboxRoles = inboxRolesFor(user.role);
  const where = {
    programId,
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

exports.acknowledgeNotification = async (id, user) => {
  const inboxRoles = inboxRolesFor(user.role);
  const row = await prisma.notifications.findFirst({
    where: {
      id,
      programId: requireProgramId(user),
      OR: [
        { recipientUserId: user.id },
        { recipientRole: { in: inboxRoles }, recipientUserId: null },
      ],
    },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Notification not found.");
  const updated = await prisma.notifications.update({ where: { id }, data: { acknowledged: true } });
  return notificationJson(updated);
};

exports.listAudit = async (query, user) => {
  if (!["spx_principal", "system_admin", "silva_owner"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = {};
  if (query.entityType) where.entityType = query.entityType;
  if (query.entityId) where.entityId = query.entityId;
  if (query.userId) where.userId = query.userId;
  if (query.action) where.action = query.action;
  const [rows, total] = await Promise.all([
    prisma.audit_log.findMany({ where, skip, take, orderBy: { timestamp: "desc" } }),
    prisma.audit_log.count({ where }),
  ]);
  return { items: rows.map(auditJson), meta: meta(page, pageSize, total) };
};

exports.findAudit = async (id, user) => {
  if (!["spx_principal", "system_admin", "silva_owner"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const row = await prisma.audit_log.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Audit record not found.");
  return auditJson(row);
};

exports.listAttachments = async (query, user) => {
  if (!query.entityType || !query.entityId) {
    throw new AppError(400, "VALIDATION_ERROR", "entityType and entityId are required.");
  }
  const rows = await prisma.attachments.findMany({
    where: { entityType: query.entityType, entityId: query.entityId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt.toISOString(),
  }));
};

exports.uploadUrl = async (dto, user) => {
  const storageKey = `${dto.entityType}/${dto.entityId}/${dto.fileName}`;
  return signedUploadUrl(storageKey, dto.contentType);
};

exports.createAttachment = async (dto, user) => {
  const row = await prisma.attachments.create({
    data: {
      id: uuid("att"),
      entityType: dto.entityType,
      entityId: dto.entityId,
      fileName: dto.fileName,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      storageKey: dto.storageKey,
      uploadedByUserId: user.id,
    },
  });
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt.toISOString(),
  };
};

exports.findAttachment = async (id, user) => {
  const row = await prisma.attachments.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Attachment not found.");
  const urls = await signedDownloadUrl(row.storageKey);
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    uploadedByUserId: row.uploadedByUserId,
    createdAt: row.createdAt.toISOString(),
    downloadUrl: urls.downloadUrl,
    expiresAt: urls.expiresAt,
  };
};

exports.deleteAttachment = async (id, user) => {
  const row = await prisma.attachments.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Attachment not found.");
  const parentDraft = await isParentDraft(row.entityType, row.entityId);
  if (!parentDraft) throw new AppError(400, "INVALID_STATE", "Attachments on non-draft parents cannot be deleted.");
  await prisma.attachments.delete({ where: { id } });
};

async function isParentDraft(entityType, entityId) {
  const map = {
    afp_line: () => prisma.afp_lines.findUnique({ where: { id: entityId } }),
    afe: () => prisma.afes.findUnique({ where: { id: entityId } }),
    work_order: () => prisma.work_orders.findUnique({ where: { id: entityId } }),
    field_ticket: () => prisma.field_tickets.findUnique({ where: { id: entityId } }),
    payment_request: () => prisma.payment_requests.findUnique({ where: { id: entityId } }),
  };
  const fn = map[entityType];
  if (!fn) return false;
  const parent = await fn();
  return parent && parent.status === "draft";
}

exports.issueGlToken = (exportId) => {
  return jwt.sign({ typ: "gl_export", exportId }, env.JWT_GL_EXPORT_SECRET, { expiresIn: "1h" });
};
