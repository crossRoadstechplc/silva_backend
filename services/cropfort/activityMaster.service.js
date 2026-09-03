const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { rejectClientComputedFields } = require("../costDerivation.service");
const auditCropfort = require("./auditCropfort.service");
const { requireProgramId } = require("../utils/programScope");

function serializeActivity(row) {
  return {
    id: row.id,
    programId: row.programId,
    templateId: row.templateId,
    code: row.code,
    name: row.name,
    laborNorm: row.laborNorm != null ? Number(row.laborNorm) : null,
    materialNorm: row.materialNorm != null ? Number(row.materialNorm) : null,
    serviceNorm: row.serviceNorm != null ? Number(row.serviceNorm) : null,
    laborWageEtb: row.laborWageEtb != null ? Number(row.laborWageEtb) : null,
    laborCostPerUnit: row.laborCostPerUnit != null ? Number(row.laborCostPerUnit) : null,
    materialRateCode: row.materialRateCode ?? null,
    serviceRateCode: row.serviceRateCode ?? null,
    benchmarkFarmARate: row.benchmarkFarmARate != null ? Number(row.benchmarkFarmARate) : null,
    benchmarkFarmBRate: row.benchmarkFarmBRate != null ? Number(row.benchmarkFarmBRate) : null,
    version: row.version,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    template: row.template
      ? {
          id: row.template.id,
          code: row.template.code,
          name: row.template.name,
          category: row.template.category,
          tier: row.template.tier,
          unitOfMeasure: row.template.unitOfMeasure,
        }
      : null,
  };
}

exports.listTemplates = async () => {
  const rows = await prisma.activity_templates.findMany({
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });
  return rows.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    category: t.category,
    tier: t.tier,
    unitOfMeasure: t.unitOfMeasure,
  }));
};

exports.list = async (user) => {
  const programId = requireProgramId(user);
  const rows = await prisma.activity_master.findMany({
    where: { programId },
    include: { template: true },
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
  return rows.map(serializeActivity);
};

exports.create = async (user, dto) => {
  const programId = requireProgramId(user);
  rejectClientComputedFields(dto);

  let code = dto.code?.trim();
  let name = dto.name?.trim();
  let templateId = dto.templateId ?? null;

  if (dto.templateId) {
    const template = await prisma.activity_templates.findUnique({ where: { id: dto.templateId } });
    if (!template) throw new AppError(404, "NOT_FOUND", "Activity template not found.");
    code = code || template.code;
    name = name || template.name;
    templateId = template.id;
  }

  if (!code || !name) {
    throw new AppError(400, "VALIDATION_ERROR", "Activity code and name are required.");
  }

  const existing = await prisma.activity_master.findFirst({
    where: { programId, code, version: 1 },
  });
  if (existing) {
    throw new AppError(409, "DUPLICATE", `Activity ${code} already exists for this program.`);
  }

  const row = await prisma.activity_master.create({
    data: {
      id: uuid("act"),
      programId,
      templateId,
      code,
      name,
      laborNorm: dto.laborNorm ?? null,
      materialNorm: dto.materialNorm ?? null,
      serviceNorm: dto.serviceNorm ?? null,
    },
    include: { template: true },
  });
  await auditCropfort.log(user.id, programId, "activity_master", row.id, "created", null, row);
  return serializeActivity(row);
};

exports.update = async (user, activityId, dto) => {
  const programId = requireProgramId(user);
  rejectClientComputedFields(dto);
  const row = await prisma.activity_master.findFirst({ where: { id: activityId, programId } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Activity not found.");

  const updated = await prisma.activity_master.update({
    where: { id: activityId },
    data: {
      name: dto.name ?? row.name,
      laborNorm: dto.laborNorm !== undefined ? dto.laborNorm : row.laborNorm,
      materialNorm: dto.materialNorm !== undefined ? dto.materialNorm : row.materialNorm,
      serviceNorm: dto.serviceNorm !== undefined ? dto.serviceNorm : row.serviceNorm,
    },
    include: { template: true },
  });
  return serializeActivity(updated);
};
