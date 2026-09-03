const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { requireProgramId } = require("../utils/programScope");

function avg(a, b) {
  const x = a != null ? Number(a) : null;
  const y = b != null ? Number(b) : null;
  if (x != null && y != null) return (x + y) / 2;
  if (x != null) return x;
  if (y != null) return y;
  return null;
}

function serialize(row) {
  return {
    id: row.id,
    farmEstateId: row.farmEstateId,
    activityId: row.activityId,
    activityCode: row.activity?.code,
    activityName: row.activity?.name,
    neighbor1Name: row.neighbor1Name,
    neighbor2Name: row.neighbor2Name,
    neighbor1Rate: row.neighbor1Rate != null ? Number(row.neighbor1Rate) : null,
    neighbor2Rate: row.neighbor2Rate != null ? Number(row.neighbor2Rate) : null,
    lockedAt: row.lockedAt?.toISOString() || null,
    recommendedRate: row.recommendedRate != null ? Number(row.recommendedRate) : null,
    proposedRate: row.proposedRate != null ? Number(row.proposedRate) : null,
    useNormWage: row.useNormWage,
    status: row.status,
    version: row.version,
    approvedAt: row.approvedAt?.toISOString() || null,
    validUntil: row.validUntil?.toISOString() || null,
  };
}

async function assertFarmApprover(farmEstateId, userId) {
  const farm = await prisma.farm_estates.findUnique({ where: { id: farmEstateId } });
  if (!farm?.approverUserId) {
    throw new AppError(400, "VALIDATION_ERROR", "Farm has no designated approver.");
  }
  if (farm.approverUserId !== userId) {
    throw new AppError(403, "FORBIDDEN", "Only the farm's designated approver may approve.");
  }
  return farm;
}

exports.list = async (user, farmEstateId, query = {}) => {
  const programId = requireProgramId(user);
  const where = { programId, farmEstateId };
  if (query.activityId) where.activityId = query.activityId;
  if (query.status) where.status = query.status;
  const rows = await prisma.benchmark_surveys.findMany({
    where,
    include: { activity: true },
    orderBy: [{ activityId: "asc" }, { version: "desc" }],
  });
  return rows.map(serialize);
};

exports.create = async (user, farmEstateId, dto) => {
  const programId = requireProgramId(user);
  const row = await prisma.benchmark_surveys.create({
    data: {
      id: uuid("bms"),
      programId,
      farmEstateId,
      activityId: dto.activityId,
      neighbor1Name: dto.neighbor1Name?.trim() || null,
      neighbor2Name: dto.neighbor2Name?.trim() || null,
      neighbor1Rate: dto.neighbor1Rate ?? null,
      neighbor2Rate: dto.neighbor2Rate ?? null,
      useNormWage: Boolean(dto.useNormWage),
      createdByUserId: user.id,
    },
    include: { activity: true },
  });
  return serialize(row);
};

exports.lock = async (user, surveyId) => {
  const row = await prisma.benchmark_surveys.findFirst({
    where: { id: surveyId, status: "draft" },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Draft survey not found.");
  if (row.lockedAt) throw new AppError(400, "INVALID_STATE", "Survey already locked.");
  const recommended = avg(row.neighbor1Rate, row.neighbor2Rate);
  const updated = await prisma.benchmark_surveys.update({
    where: { id: surveyId },
    data: {
      lockedAt: new Date(),
      recommendedRate: recommended,
      proposedRate: row.proposedRate ?? recommended,
    },
    include: { activity: true },
  });
  return serialize(updated);
};

exports.propose = async (user, surveyId, proposedRate) => {
  const row = await prisma.benchmark_surveys.findFirst({
    where: { id: surveyId, status: "draft" },
  });
  if (!row?.lockedAt) {
    throw new AppError(400, "INVALID_STATE", "Survey must be locked before proposing.");
  }
  const updated = await prisma.benchmark_surveys.update({
    where: { id: surveyId },
    data: { proposedRate },
    include: { activity: true },
  });
  return serialize(updated);
};

exports.submit = async (user, surveyId) => {
  const row = await prisma.benchmark_surveys.findFirst({
    where: { id: surveyId, status: "draft" },
  });
  if (!row?.lockedAt) throw new AppError(400, "INVALID_STATE", "Survey must be locked.");
  const updated = await prisma.benchmark_surveys.update({
    where: { id: surveyId },
    data: { status: "submitted", submittedAt: new Date() },
    include: { activity: true },
  });
  return serialize(updated);
};

exports.approve = async (user, surveyId) => {
  const row = await prisma.benchmark_surveys.findFirst({
    where: { id: surveyId, status: "submitted" },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Submitted survey not found.");
  await assertFarmApprover(row.farmEstateId, user.id);
  const approvedAt = new Date();
  const validUntil = new Date(approvedAt);
  validUntil.setUTCFullYear(validUntil.getUTCFullYear() + 1);
  const updated = await prisma.benchmark_surveys.update({
    where: { id: surveyId },
    data: {
      status: "approved",
      approvedAt,
      validUntil,
      approverUserId: user.id,
    },
    include: { activity: true },
  });
  return serialize(updated);
};

exports.markUseNormWage = async (user, farmEstateId, activityId) => {
  const programId = requireProgramId(user);
  const row = await prisma.benchmark_surveys.create({
    data: {
      id: uuid("bms"),
      programId,
      farmEstateId,
      activityId,
      useNormWage: true,
      status: "approved",
      approvedAt: new Date(),
      createdByUserId: user.id,
    },
    include: { activity: true },
  });
  return serialize(row);
};

/**
 * Seed benchmark surveys for a farm from the Chaka workbook.
 * Tier 1 rows with neighbor rates import as approved surveys; Tier 1 rows the
 * workbook left blank are flagged norm×wage so the stage 2 gate can clear.
 */
exports.importFromWorkbook = async (user, farmEstateId) => {
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findFirst({ where: { id: farmEstateId, programId } });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm not found.");

  const { parseBenchmarkSurveyDetail } = require("../../lib/cropfortFieldOsImport");
  let detail;
  try {
    detail = parseBenchmarkSurveyDetail();
  } catch (err) {
    throw new AppError(
      422,
      "WORKBOOK_UNAVAILABLE",
      "Could not read the Cropfort workbook on the server.",
    );
  }
  if (!detail.size) {
    throw new AppError(422, "WORKBOOK_EMPTY", "Benchmark Rate Survey sheet has no rows.");
  }

  const activities = await prisma.activity_master.findMany({
    where: { programId, code: { startsWith: "T1-" } },
    select: { id: true, code: true },
  });
  if (!activities.length) {
    throw new AppError(422, "CATALOG_MISSING", "Tier 1 activity catalog is not imported yet.");
  }

  const existing = await prisma.benchmark_surveys.findMany({
    where: { programId, farmEstateId },
    orderBy: { version: "desc" },
  });
  const existingByActivity = new Map();
  for (const row of existing) {
    if (!existingByActivity.has(row.activityId)) existingByActivity.set(row.activityId, row);
  }

  let imported = 0;
  let normWage = 0;
  let refreshed = 0;
  let unchanged = 0;

  const differs = (current, next) => {
    const a = current == null ? null : Number(current);
    const b = next == null ? null : Number(next);
    if (a == null || b == null) return a !== b;
    return Math.abs(a - b) > 1e-6;
  };

  for (const activity of activities) {
    const row = detail.get(activity.code);
    const recommended = row ? avg(row.neighbor1Rate, row.neighbor2Rate) : null;
    const current = existingByActivity.get(activity.id);

    if (recommended == null) {
      if (current) {
        if (current.useNormWage) {
          unchanged += 1;
        } else {
          await prisma.benchmark_surveys.update({
            where: { id: current.id },
            data: { useNormWage: true, neighbor1Rate: null, neighbor2Rate: null, proposedRate: null },
          });
          refreshed += 1;
        }
        continue;
      }
      await prisma.benchmark_surveys.create({
        data: {
          id: uuid("bms"),
          programId,
          farmEstateId,
          activityId: activity.id,
          useNormWage: true,
          status: "approved",
          approvedAt: new Date(),
          createdByUserId: user.id,
        },
      });
      normWage += 1;
      continue;
    }

    const approvedAt = row.approvalDate || current?.approvedAt || new Date();
    const validUntil =
      row.validUntil ||
      new Date(
        Date.UTC(approvedAt.getUTCFullYear() + 1, approvedAt.getUTCMonth(), approvedAt.getUTCDate()),
      );
    const rates = {
      neighbor1Name: row.neighbor1Name,
      neighbor2Name: row.neighbor2Name,
      neighbor1Rate: row.neighbor1Rate,
      neighbor2Rate: row.neighbor2Rate,
      recommendedRate: row.recommendedRate ?? recommended,
      proposedRate: row.proposedRate ?? row.recommendedRate ?? recommended,
    };

    if (current) {
      // The workbook is the source of truth, so re-sync rates that have drifted
      // (older rows were stored at 2-decimal precision).
      const drifted =
        current.useNormWage ||
        differs(current.neighbor1Rate, rates.neighbor1Rate) ||
        differs(current.neighbor2Rate, rates.neighbor2Rate) ||
        differs(current.recommendedRate, rates.recommendedRate) ||
        differs(current.proposedRate, rates.proposedRate);
      if (!drifted) {
        unchanged += 1;
        continue;
      }
      await prisma.benchmark_surveys.update({
        where: { id: current.id },
        data: {
          ...rates,
          useNormWage: false,
          lockedAt: row.locked ? approvedAt : null,
          status: "approved",
          approvedAt,
          validUntil,
        },
      });
      refreshed += 1;
      continue;
    }

    await prisma.benchmark_surveys.create({
      data: {
        id: uuid("bms"),
        programId,
        farmEstateId,
        activityId: activity.id,
        ...rates,
        lockedAt: row.locked ? approvedAt : null,
        status: "approved",
        submittedAt: approvedAt,
        approvedAt,
        validUntil,
        approverUserId: farm.approverUserId || null,
        createdByUserId: user.id,
      },
    });
    imported += 1;
  }

  return { imported, normWage, refreshed, unchanged, tier1Total: activities.length };
};

exports.getEffective = async (farmEstateId, activityId) => {
  const row = await prisma.benchmark_surveys.findFirst({
    where: { farmEstateId, activityId, status: "approved" },
    orderBy: { approvedAt: "desc" },
    include: { activity: true },
  });
  return row ? serialize(row) : null;
};
