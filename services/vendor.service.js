const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { decimal, parseListQuery, meta, isoDate } = require("../utils/helpers");
const { vendorJson, contractJson, scorecardJson, userJson } = require("../utils/serializers");
const { isVendorRole, isSpxRole } = require("../utils/roles");
const authService = require("./auth.service");

exports.findAll = async (query, user) => {
  if (isVendorRole(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Vendors cannot list other vendors.");
  }
  const { page, pageSize, skip, take } = parseListQuery(query);
  const [rows, total] = await Promise.all([
    prisma.vendors.findMany({ skip, take, orderBy: { createdAt: "desc" } }),
    prisma.vendors.count(),
  ]);
  return { items: rows.map(vendorJson), meta: meta(page, pageSize, total) };
};

exports.findOne = async (id, user) => {
  const row = await prisma.vendors.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Vendor not found.");
  if (isVendorRole(user.role) && row.id !== user.vendorId) {
    throw new AppError(404, "NOT_FOUND", "Vendor not found.");
  }
  return vendorJson(row);
};

exports.create = async (dto, user) => {
  if (dto.isDefaultExecutionPartner) {
    const existing = await prisma.vendors.findFirst({ where: { isDefaultExecutionPartner: true } });
    if (existing) throw new AppError(409, "CONFLICT", "Default execution partner already exists.");
  }
  const org = await prisma.organizations.create({
    data: {
      id: uuid("org"),
      name: dto.name,
      type: "vendor",
      isDefaultExecutionPartner: Boolean(dto.isDefaultExecutionPartner),
    },
  });
  const vendor = await prisma.vendors.create({
    data: {
      id: uuid("vnd"),
      organizationId: org.id,
      name: dto.name,
      category: dto.category,
      servicesProvided: dto.servicesProvided || "",
      prequalified: Boolean(dto.prequalified),
      insuranceOnFile: Boolean(dto.insuranceOnFile),
      insuranceExpiry: dto.insuranceExpiry ? new Date(`${dto.insuranceExpiry}T00:00:00.000Z`) : null,
      isDefaultExecutionPartner: Boolean(dto.isDefaultExecutionPartner),
      status: "pending",
    },
  });
  return vendorJson(vendor);
};

exports.update = async (id, dto, user) => {
  const row = await prisma.vendors.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Vendor not found.");
  if (dto.isDefaultExecutionPartner && user.role !== "spx_principal") {
    throw new AppError(403, "FORBIDDEN", "Only SPX principal can change default partner.");
  }
  const updated = await prisma.vendors.update({
    where: { id },
    data: {
      name: dto.name ?? row.name,
      category: dto.category ?? row.category,
      servicesProvided: dto.servicesProvided ?? row.servicesProvided,
      prequalified: dto.prequalified ?? row.prequalified,
      insuranceOnFile: dto.insuranceOnFile ?? row.insuranceOnFile,
      insuranceExpiry: dto.insuranceExpiry ? new Date(`${dto.insuranceExpiry}T00:00:00.000Z`) : row.insuranceExpiry,
      isDefaultExecutionPartner: dto.isDefaultExecutionPartner ?? row.isDefaultExecutionPartner,
    },
  });
  return vendorJson(updated);
};

exports.activate = async (id) => {
  const row = await prisma.vendors.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Vendor not found.");
  return vendorJson(await prisma.vendors.update({ where: { id }, data: { status: "active" } }));
};

exports.deactivate = async (id, status = "terminated") => {
  const row = await prisma.vendors.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Vendor not found.");
  return vendorJson(await prisma.vendors.update({ where: { id }, data: { status } }));
};

exports.listUsers = async (vendorId, user, query) => {
  const vendor = await prisma.vendors.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new AppError(404, "NOT_FOUND", "Vendor not found.");
  if (isVendorRole(user.role) && user.vendorId !== vendorId) {
    throw new AppError(404, "NOT_FOUND", "Vendor not found.");
  }
  return authService.listUsers({ ...user, role: isVendorRole(user.role) ? user.role : "spx_principal", vendorId }, {
    ...query,
    vendorId,
  });
};

exports.inviteUser = async (vendorId, dto, user) => {
  const vendor = await prisma.vendors.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new AppError(404, "NOT_FOUND", "Vendor not found.");
  return authService.createInvite(user, vendor.organizationId, dto);
};

exports.listContracts = async (query, user) => {
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = {};
  if (isVendorRole(user.role)) where.vendorId = user.vendorId;
  if (query.vendorId) where.vendorId = query.vendorId;
  if (query.afeId) where.afeId = query.afeId;
  if (query.tenderStatus) where.tenderStatus = query.tenderStatus;
  const [rows, total] = await Promise.all([
    prisma.vendor_contracts.findMany({ where, skip, take }),
    prisma.vendor_contracts.count({ where }),
  ]);
  return { items: rows.map(contractJson), meta: meta(page, pageSize, total) };
};

exports.createContract = async (dto, user) => {
  const vendor = await prisma.vendors.findUnique({ where: { id: dto.vendorId } });
  if (!vendor) throw new AppError(404, "NOT_FOUND", "Vendor not found.");
  if (Number(dto.contractValueUsd) > 10000 && dto.procurementRoute !== "competitive_tender" && !vendor.isDefaultExecutionPartner) {
    throw new AppError(422, "BUSINESS_RULE_VIOLATION", "Contracts above 10000 USD require competitive tender.");
  }
  const row = await prisma.vendor_contracts.create({
    data: {
      id: uuid("vct"),
      vendorId: dto.vendorId,
      afeId: dto.afeId,
      contractValueUsd: decimal(dto.contractValueUsd),
      procurementRoute: dto.procurementRoute,
      tenderStatus: dto.tenderStatus || "n_a",
      contractStart: new Date(`${dto.contractStart}T00:00:00.000Z`),
      contractEnd: new Date(`${dto.contractEnd}T00:00:00.000Z`),
    },
  });
  return contractJson(row);
};

exports.findContract = async (id, user) => {
  const row = await prisma.vendor_contracts.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Contract not found.");
  if (isVendorRole(user.role) && row.vendorId !== user.vendorId) {
    throw new AppError(404, "NOT_FOUND", "Contract not found.");
  }
  return contractJson(row);
};

exports.updateContract = async (id, dto, user) => {
  const row = await prisma.vendor_contracts.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Contract not found.");
  const updated = await prisma.vendor_contracts.update({
    where: { id },
    data: {
      contractValueUsd: dto.contractValueUsd !== undefined ? decimal(dto.contractValueUsd) : undefined,
      procurementRoute: dto.procurementRoute ?? row.procurementRoute,
      tenderStatus: dto.tenderStatus ?? row.tenderStatus,
      contractStart: dto.contractStart ? new Date(`${dto.contractStart}T00:00:00.000Z`) : undefined,
      contractEnd: dto.contractEnd ? new Date(`${dto.contractEnd}T00:00:00.000Z`) : undefined,
    },
  });
  return contractJson(updated);
};

function overall(q, t, c) {
  return Math.round((Number(q) + Number(t) + Number(c)) / 3);
}

exports.listScorecards = async (query, user) => {
  const { page, pageSize, skip, take } = parseListQuery(query);
  const where = {};
  if (isVendorRole(user.role)) where.vendorId = user.vendorId;
  if (query.vendorId) where.vendorId = query.vendorId;
  if (query.reviewPeriod) where.reviewPeriod = query.reviewPeriod;
  const [rows, total] = await Promise.all([
    prisma.vendor_scorecards.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.vendor_scorecards.count({ where }),
  ]);
  return { items: rows.map(scorecardJson), meta: meta(page, pageSize, total) };
};

exports.createScorecard = async (dto, user) => {
  const row = await prisma.vendor_scorecards.create({
    data: {
      id: uuid("vsc"),
      vendorId: dto.vendorId,
      reviewPeriod: dto.reviewPeriod,
      qualityScore: dto.qualityScore,
      timelinessScore: dto.timelinessScore,
      costAdherenceScore: dto.costAdherenceScore,
      overallScore: overall(dto.qualityScore, dto.timelinessScore, dto.costAdherenceScore),
      reviewedByUserId: user.id,
      notes: dto.notes ?? null,
    },
  });
  return scorecardJson(row);
};

exports.findScorecard = async (id, user) => {
  const row = await prisma.vendor_scorecards.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Scorecard not found.");
  if (isVendorRole(user.role) && row.vendorId !== user.vendorId) {
    throw new AppError(404, "NOT_FOUND", "Scorecard not found.");
  }
  return scorecardJson(row);
};

exports.updateScorecard = async (id, dto, user) => {
  const row = await prisma.vendor_scorecards.findUnique({ where: { id } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Scorecard not found.");
  const q = dto.qualityScore ?? row.qualityScore;
  const t = dto.timelinessScore ?? row.timelinessScore;
  const c = dto.costAdherenceScore ?? row.costAdherenceScore;
  const updated = await prisma.vendor_scorecards.update({
    where: { id },
    data: { qualityScore: q, timelinessScore: t, costAdherenceScore: c, overallScore: overall(q, t, c), notes: dto.notes ?? row.notes },
  });
  return scorecardJson(updated);
};
