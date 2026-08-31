const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { rejectClientComputedFields, computeCropfortAfeBand } = require("../costDerivation.service");
const { applyFarmOwnerListFilter } = require("../../lib/visibilityGate");
const { isFarmOwner } = require("../../utils/cropfortRoles");
const approvable = require("../../lib/approvable");
const auditCropfort = require("./auditCropfort.service");
const { requireProgramId } = require("../utils/programScope");

async function getProgramBands(programId) {
  return prisma.programs.findUnique({
    where: { id: programId },
    select: {
      cropfortAfeBandAMaxEtb: true,
      cropfortAfeBandBMaxEtb: true,
      cropfortAfeBandCMaxEtb: true,
    },
  });
}

function serializeAfe(row) {
  return {
    id: row.id,
    programId: row.programId,
    title: row.title,
    amountEtb: Number(row.amountEtb),
    band: row.band,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    status: row.status,
    version: row.version,
    returnedComment: row.returnedComment,
    submittedAt: row.submittedAt,
    approvedAt: row.approvedAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

exports.list = async (user, query) => {
  const programId = requireProgramId(user);
  const farmOwner = await isFarmOwner(user.id, programId);
  let where = { programId };
  if (query.status) where.status = query.status;
  if (query.band) where.band = query.band;
  if (query.sourceType) where.sourceType = query.sourceType;
  if (farmOwner && !query.status) {
    where = applyFarmOwnerListFilter(where, true);
  }
  const rows = await prisma.cropfort_afes.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map(serializeAfe);
};

exports.create = async (user, dto) => {
  const programId = requireProgramId(user);
  rejectClientComputedFields(dto);
  const program = await getProgramBands(programId);
  if (!program) throw new AppError(404, "NOT_FOUND", "Program not found.");
  const band = computeCropfortAfeBand(dto.amountEtb, program);
  const row = await prisma.cropfort_afes.create({
    data: {
      id: uuid("caf"),
      programId,
      title: dto.title.trim(),
      amountEtb: dto.amountEtb,
      band,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId ?? null,
      createdByUserId: user.id,
    },
  });
  await auditCropfort.log(user.id, programId, "cropfort_afe", row.id, "created", null, row);
  return serializeAfe(row);
};

exports.update = async (user, afeId, dto) => {
  const programId = requireProgramId(user);
  rejectClientComputedFields(dto);
  const row = await prisma.cropfort_afes.findFirst({
    where: { id: afeId, programId, status: "draft" },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Draft Cropfort AFE not found.");
  const program = await getProgramBands(programId);
  const amountEtb = dto.amountEtb ?? Number(row.amountEtb);
  const band = computeCropfortAfeBand(amountEtb, program);
  const updated = await prisma.cropfort_afes.update({
    where: { id: afeId },
    data: {
      title: dto.title?.trim() ?? row.title,
      amountEtb,
      band,
      sourceType: dto.sourceType ?? row.sourceType,
      sourceId: dto.sourceId !== undefined ? dto.sourceId : row.sourceId,
    },
  });
  return serializeAfe(updated);
};

exports.submit = async (user, afeIds) => {
  const programId = requireProgramId(user);
  await approvable.submitLines("cropfort_afe", afeIds, user, programId);
  const rows = await prisma.cropfort_afes.findMany({ where: { id: { in: afeIds } } });
  return rows.map(serializeAfe);
};

exports.approve = async (user, afeId, comment) => {
  const programId = requireProgramId(user);
  const updated = await approvable.approveLine("cropfort_afe", afeId, user, programId, comment);
  return serializeAfe(updated);
};

exports.returnAfe = async (user, afeId, comment) => {
  const programId = requireProgramId(user);
  const updated = await approvable.returnLine("cropfort_afe", afeId, user, programId, comment);
  return serializeAfe(updated);
};

exports.previewBand = async (user, amountEtb) => {
  const programId = requireProgramId(user);
  const program = await getProgramBands(programId);
  const band = computeCropfortAfeBand(amountEtb, program);
  return {
    amountEtb: Number(amountEtb),
    band,
    thresholds: {
      bandAMaxEtb: Number(program?.cropfortAfeBandAMaxEtb ?? 500000),
      bandBMaxEtb: Number(program?.cropfortAfeBandBMaxEtb ?? 2000000),
      bandCMaxEtb: Number(program?.cropfortAfeBandCMaxEtb ?? 5000000),
    },
  };
};
