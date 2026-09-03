const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const {
  rejectClientComputedFields,
  enrichRateCardLine,
} = require("../costDerivation.service");
const {
  applyFarmOwnerListFilter,
  serializeRateCardLineForFarmOwner,
  serializeRateCardLineForSpx,
} = require("../../lib/visibilityGate");
const { isFarmOwner } = require("../../utils/cropfortRoles");
const approvable = require("../../lib/approvable");
const auditCropfort = require("./auditCropfort.service");
const { requireProgramId } = require("../utils/programScope");

async function getProgramThreshold(programId) {
  const program = await prisma.programs.findUnique({
    where: { id: programId },
    select: { cropfortRateFlagThresholdPct: true },
  });
  return Number(program?.cropfortRateFlagThresholdPct ?? 10);
}

function serializeLine(line, thresholdPct, farmOwner) {
  if (farmOwner) return serializeRateCardLineForFarmOwner(line, thresholdPct);
  return serializeRateCardLineForSpx(line, thresholdPct);
}

exports.list = async (user, query) => {
  const programId = requireProgramId(user);
  const farmOwner = await isFarmOwner(user.id, programId);
  const threshold = await getProgramThreshold(programId);
  let where = { programId };
  if (farmOwner) {
    if (query.status) {
      where.status = query.status;
    } else {
      where = applyFarmOwnerListFilter(where, true);
    }
  } else if (query.status) {
    where.status = query.status;
  }
  const lines = await prisma.rate_card_lines.findMany({
    where,
    orderBy: [{ resourceCode: "asc" }, { version: "desc" }],
  });
  return lines.map((l) => serializeLine(l, threshold, farmOwner));
};

exports.create = async (user, dto) => {
  const programId = requireProgramId(user);
  rejectClientComputedFields(dto);
  const threshold = await getProgramThreshold(programId);
  const line = await prisma.rate_card_lines.create({
    data: {
      id: uuid("rcl"),
      programId,
      resourceCode: dto.resourceCode,
      resourceName: dto.resourceName,
      resourceType: dto.resourceType ?? null,
      unitOfMeasure: dto.unitOfMeasure,
      rateEtb: dto.rateEtb,
      benchmarkFarmARate: dto.benchmarkFarmARate ?? null,
      benchmarkFarmBRate: dto.benchmarkFarmBRate ?? null,
      spxJustificationNote: dto.spxJustificationNote ?? null,
      createdByUserId: user.id,
    },
  });
  await auditCropfort.log(user.id, programId, "rate_card_line", line.id, "created", null, line);
  return serializeLine(line, threshold, false);
};

exports.update = async (user, lineId, dto) => {
  const programId = requireProgramId(user);
  rejectClientComputedFields(dto);
  const line = await prisma.rate_card_lines.findFirst({
    where: { id: lineId, programId, status: "draft" },
  });
  if (!line) throw new AppError(404, "NOT_FOUND", "Draft rate card line not found.");
  const updated = await prisma.rate_card_lines.update({
    where: { id: lineId },
    data: {
      resourceCode: dto.resourceCode ?? line.resourceCode,
      resourceName: dto.resourceName ?? line.resourceName,
      resourceType: dto.resourceType !== undefined ? dto.resourceType : line.resourceType,
      unitOfMeasure: dto.unitOfMeasure ?? line.unitOfMeasure,
      rateEtb: dto.rateEtb ?? line.rateEtb,
      benchmarkFarmARate: dto.benchmarkFarmARate !== undefined ? dto.benchmarkFarmARate : line.benchmarkFarmARate,
      benchmarkFarmBRate: dto.benchmarkFarmBRate !== undefined ? dto.benchmarkFarmBRate : line.benchmarkFarmBRate,
      spxJustificationNote:
        dto.spxJustificationNote !== undefined ? dto.spxJustificationNote : line.spxJustificationNote,
    },
  });
  const threshold = await getProgramThreshold(programId);
  return serializeLine(updated, threshold, false);
};

exports.submit = async (user, lineIds) => {
  const programId = requireProgramId(user);
  const threshold = await getProgramThreshold(programId);
  const drafts = await prisma.rate_card_lines.findMany({
    where: { programId, id: { in: lineIds }, status: "draft" },
  });
  if (drafts.length !== lineIds.length) {
    throw new AppError(400, "INVALID_STATE", "All lines must be draft to submit.");
  }
  const flaggedMissing = drafts.filter((line) => {
    const { isFlagged } = enrichRateCardLine(line, threshold);
    return isFlagged && !line.spxJustificationNote?.trim();
  });
  if (flaggedMissing.length) {
    throw new AppError(422, "JUSTIFICATION_REQUIRED", "Flagged lines require justification notes.", {
      lineIds: flaggedMissing.map((l) => l.id),
    });
  }
  await approvable.submitLines("rate_card_line", lineIds, user, programId);
  const lines = await prisma.rate_card_lines.findMany({ where: { id: { in: lineIds } } });
  return lines.map((l) => serializeLine(l, threshold, false));
};

exports.approveLine = async (user, lineId, comment) => {
  const programId = requireProgramId(user);
  const updated = await approvable.approveLine("rate_card_line", lineId, user, programId, comment);
  const threshold = await getProgramThreshold(programId);
  return serializeLine(updated, threshold, false);
};

exports.returnLine = async (user, lineId, comment) => {
  const programId = requireProgramId(user);
  const updated = await approvable.returnLine("rate_card_line", lineId, user, programId, comment);
  const threshold = await getProgramThreshold(programId);
  return serializeLine(updated, threshold, false);
};

exports.reopenLine = async (user, lineId) => {
  const programId = requireProgramId(user);
  const line = await prisma.rate_card_lines.findFirst({
    where: { id: lineId, programId, status: "returned" },
  });
  if (!line) throw new AppError(404, "NOT_FOUND", "Returned rate card line not found.");
  const newLine = await approvable.reopenReturnedLine("rate_card_line", lineId, user, programId, {
    programId,
    resourceCode: line.resourceCode,
    resourceName: line.resourceName,
    unitOfMeasure: line.unitOfMeasure,
    rateEtb: line.rateEtb,
    benchmarkFarmARate: line.benchmarkFarmARate,
    benchmarkFarmBRate: line.benchmarkFarmBRate,
    spxJustificationNote: line.spxJustificationNote,
  });
  const threshold = await getProgramThreshold(programId);
  return serializeLine(newLine, threshold, false);
};
