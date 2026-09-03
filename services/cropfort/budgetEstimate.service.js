const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { activityLineCosts, resolveQty } = require("../costDerivation.service");
const { getApprovedRateByCode } = require("./rateMap.service");
const { resolveLaborRate } = require("./resolveLaborRate.service");
const { requireProgramId } = require("../utils/programScope");
const { isFarmOwner } = require("../../utils/cropfortRoles");

exports.estimate = async (user, dto) => {
  const programId = requireProgramId(user);
  const farmOwner = await isFarmOwner(user.id, programId);
  const farmEstateId = dto.farmEstateId || null;
  const blockIds = Array.isArray(dto.blockIds) ? dto.blockIds.filter(Boolean) : [];
  const activityIds = Array.isArray(dto.activityIds) ? dto.activityIds.filter(Boolean) : [];

  if (!activityIds.length) {
    throw new AppError(400, "VALIDATION_ERROR", "At least one activity is required.");
  }

  let blocks = [];
  let estate = null;

  if (blockIds.length) {
    blocks = await prisma.farm_blocks.findMany({
      where: { programId, id: { in: blockIds } },
      include: { farmEstate: { select: { id: true, name: true, totalAreaHa: true } } },
    });
    if (blocks.length !== blockIds.length) {
      throw new AppError(404, "NOT_FOUND", "One or more blocks were not found.");
    }
  } else if (dto.farmEstateId) {
    estate = await prisma.farm_estates.findFirst({
      where: { programId, id: dto.farmEstateId, status: "active" },
      include: { blocks: true },
    });
    if (!estate) throw new AppError(404, "NOT_FOUND", "Farm estate not found.");
    blocks = estate.blocks?.length ? estate.blocks : [{ id: null, code: "FARM", label: estate.name, areaHa: estate.totalAreaHa, treeCount: null }];
  } else {
    throw new AppError(400, "VALIDATION_ERROR", "Provide blockIds or farmEstateId.");
  }

  const resolvedFarmId =
    farmEstateId || blocks[0]?.farmEstateId || blocks[0]?.farmEstate?.id || null;
  const rateMap = await getApprovedRateByCode(programId, resolvedFarmId);

  const activities = await prisma.activity_master.findMany({
    where: { programId, id: { in: activityIds } },
    include: { template: true },
  });
  if (activities.length !== activityIds.length) {
    throw new AppError(404, "NOT_FOUND", "One or more activities were not found.");
  }

  const lineItems = [];
  const warnings = new Set();
  let totalLabor = 0;
  let totalMaterial = 0;
  let totalService = 0;

  for (const block of blocks) {
    const blockEstate = block.farmEstate || estate;
    for (const activity of activities) {
      const uom = activity.template?.unitOfMeasure || "ha";
      const qty = resolveQty(block, uom, blockEstate || estate);
      if (qty <= 0) {
        warnings.add(`No quantity driver for ${activity.code} on block ${block.code || "farm"} (${uom}).`);
        continue;
      }
      const blockFarmId = block.farmEstateId || block.farmEstate?.id || resolvedFarmId;
      let activityForCost = activity;
      if (blockFarmId) {
        const labor = await resolveLaborRate(blockFarmId, activity.id);
        if (labor.rateEtb > 0) {
          activityForCost = {
            ...activity,
            laborCostPerUnit: labor.rateEtb,
            laborNorm: null,
            laborWageEtb: null,
          };
        }
      }
      const costs = activityLineCosts(qty, activityForCost, rateMap);
      costs.warnings.forEach((w) => warnings.add(w));
      if (costs.totalCostEtb <= 0 && !costs.warnings.length) {
        warnings.add(`Activity ${activity.code} has no costing data (norms/rates missing).`);
      }
      totalLabor += costs.laborCostEtb;
      totalMaterial += costs.materialCostEtb;
      totalService += costs.serviceCostEtb;
      lineItems.push({
        blockId: block.id,
        blockCode: block.code,
        blockLabel: block.label,
        activityId: activity.id,
        activityCode: activity.code,
        activityName: activity.name,
        unitOfMeasure: uom,
        qty,
        laborCostEtb: costs.laborCostEtb,
        materialCostEtb: costs.materialCostEtb,
        serviceCostEtb: costs.serviceCostEtb,
        totalCostEtb: costs.totalCostEtb,
        warnings: costs.warnings,
        ...(farmOwner
          ? {}
          : {
              laborWageEtb: activity.laborWageEtb != null ? Number(activity.laborWageEtb) : null,
              laborCostPerUnit:
                activity.laborCostPerUnit != null ? Number(activity.laborCostPerUnit) : null,
              materialRateCode: activity.materialRateCode,
              serviceRateCode: activity.serviceRateCode,
            }),
      });
    }
  }

  const totalCostEtb = Number((totalLabor + totalMaterial + totalService).toFixed(2));

  return {
    lineItems,
    totals: {
      laborCostEtb: Number(totalLabor.toFixed(2)),
      materialCostEtb: Number(totalMaterial.toFixed(2)),
      serviceCostEtb: Number(totalService.toFixed(2)),
      totalCostEtb,
    },
    warnings: [...warnings],
  };
};
