/**
 * Seed Cropfort Field OS catalog + B-Agro farm portfolio into the database.
 */
const { uuid } = require("../utils/ids");
const { loadCatalog, BAGRO_FARMS, CHAKA_ESTATE } = require("../lib/cropfortFieldOsImport");

function slugCode(code) {
  return code.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

async function clearCropfortCatalog(prisma, programId) {
  await prisma.spx_validation_checks.deleteMany({ where: { programId } });
  await prisma.weekly_submission_tickets.deleteMany({
    where: { weeklySubmission: { programId } },
  });
  await prisma.weekly_submissions.deleteMany({ where: { programId } });
  await prisma.block_field_tickets.deleteMany({ where: { programId } });
  await prisma.afp_block_lines.deleteMany({ where: { programId } });
  await prisma.rate_card_lines.deleteMany({ where: { programId } });
  await prisma.activity_master.deleteMany({ where: { programId } });
  await prisma.activity_templates.deleteMany({});
}

async function clearFarmEstates(prisma, programId) {
  await prisma.supervisor_progress.deleteMany({ where: { programId } });
  await prisma.cropfort_activity_plans.deleteMany({ where: { programId } });
  await prisma.cropfort_elections.deleteMany({ where: { programId } });
  await prisma.fee_schedule_lines.deleteMany({
    where: { feeSchedule: { programId } },
  });
  await prisma.fee_schedules.deleteMany({ where: { programId } });
  await prisma.benchmark_surveys.deleteMany({ where: { programId } });
  await prisma.labor_rate_cards.deleteMany({ where: { programId } });
  await prisma.farm_workflow_stages.deleteMany({
    where: { farmEstate: { programId } },
  });
  await prisma.monthly_client_reports.deleteMany({ where: { programId } });
  await prisma.farm_estate_vendors.deleteMany({
    where: { farmEstate: { programId } },
  });
  await prisma.farm_blocks.deleteMany({ where: { programId } });
  await prisma.farm_estates.deleteMany({ where: { programId } });
}

async function clonePerFarmRates(prisma, ctx, estateIds) {
  const { programId, createdByUserId } = ctx;
  const templates = await prisma.rate_card_lines.findMany({
    where: { programId, farmEstateId: null, status: "approved" },
  });
  const activities = await prisma.activity_master.findMany({ where: { programId } });
  let farmRateLines = 0;
  let laborCards = 0;

  for (const farmId of estateIds) {
    for (const tpl of templates) {
      await prisma.rate_card_lines.create({
        data: {
          id: uuid("rcl"),
          programId,
          farmEstateId: farmId,
          resourceCode: tpl.resourceCode,
          resourceName: tpl.resourceName,
          resourceType: tpl.resourceType,
          unitOfMeasure: tpl.unitOfMeasure,
          rateEtb: tpl.rateEtb,
          status: "approved",
          version: 1,
          approvedAt: new Date(),
          effectiveFrom: tpl.effectiveFrom,
          createdByUserId,
        },
      });
      farmRateLines += 1;
    }
    for (const act of activities) {
      const norm = act.laborNorm != null ? Number(act.laborNorm) : 0;
      const wage = act.laborWageEtb != null ? Number(act.laborWageEtb) : 0;
      if (norm <= 0 && wage <= 0 && !act.laborCostPerUnit) continue;
      await prisma.labor_rate_cards.create({
        data: {
          id: uuid("lrc"),
          programId,
          farmEstateId: farmId,
          activityId: act.id,
          normMandayPerUnit: act.laborNorm,
          wageRatePerManday: act.laborWageEtb,
          status: "approved",
          version: 1,
          createdByUserId,
        },
      });
      laborCards += 1;
    }
  }
  return { farmRateLines, laborCards };
}

const CATALOG_NUMERIC_FIELDS = [
  "laborNorm",
  "materialNorm",
  "serviceNorm",
  "laborWageEtb",
  "laborCostPerUnit",
  "benchmarkFarmARate",
  "benchmarkFarmBRate",
];
const CATALOG_TEXT_FIELDS = ["name", "materialRateCode", "serviceRateCode"];

/**
 * createMany(skipDuplicates) leaves pre-existing catalog rows untouched, so norms
 * and rates would keep stale values after the workbook changes. Re-align them.
 */
async function reconcileCatalogRows(delegate, desiredRows, currentRows) {
  const currentByCode = new Map(currentRows.map((r) => [r.code, r]));
  let refreshed = 0;

  for (const desired of desiredRows) {
    const current = currentByCode.get(desired.code);
    if (!current) continue;

    const data = {};
    for (const field of CATALOG_NUMERIC_FIELDS) {
      if (!(field in desired)) continue;
      const a = current[field] == null ? null : Number(current[field]);
      const b = desired[field] == null ? null : Number(desired[field]);
      const same = a == null || b == null ? a === b : Math.abs(a - b) <= 1e-9;
      if (!same) data[field] = desired[field];
    }
    for (const field of CATALOG_TEXT_FIELDS) {
      if (!(field in desired)) continue;
      if ((current[field] ?? null) !== (desired[field] ?? null)) data[field] = desired[field];
    }

    if (Object.keys(data).length) {
      await delegate.update({ where: { id: current.id }, data });
      refreshed += 1;
    }
  }

  return refreshed;
}

async function importCropfortFieldOs(prisma, ctx, options = {}) {
  const { programId, silvaOrgId, bagroVendorId, createdByUserId } = ctx;
  const { replace = true } = options;
  const catalog = loadCatalog();
  const now = new Date();

  if (replace) {
    await clearCropfortCatalog(prisma, programId);
  }

  const templateRows = catalog.activities.map((a) => ({
    id: `atpl_${slugCode(a.code)}`,
    code: a.code,
    name: a.name,
    category: a.category,
    tier: a.tier,
    unitOfMeasure: a.unitOfMeasure,
    laborNorm: a.laborNorm,
    materialNorm: a.materialNorm,
    serviceNorm: a.serviceNorm,
    laborWageEtb: a.laborWageEtb,
    laborCostPerUnit: a.laborCostPerUnit,
    materialRateCode: a.materialRateCode,
    serviceRateCode: a.serviceRateCode,
  }));

  await prisma.activity_templates.createMany({ data: templateRows, skipDuplicates: true });
  const templatesRefreshed = await reconcileCatalogRows(
    prisma.activity_templates,
    templateRows,
    await prisma.activity_templates.findMany({
      where: { code: { in: templateRows.map((r) => r.code) } },
    }),
  );

  const masterRows = catalog.activities.map((a) => ({
    id: `act_${slugCode(a.code)}`,
    programId,
    templateId: `atpl_${slugCode(a.code)}`,
    code: a.code,
    name: a.name,
    laborNorm: a.laborNorm,
    materialNorm: a.materialNorm,
    serviceNorm: a.serviceNorm,
    laborWageEtb: a.laborWageEtb,
    laborCostPerUnit: a.laborCostPerUnit,
    materialRateCode: a.materialRateCode,
    serviceRateCode: a.serviceRateCode,
    benchmarkFarmARate: a.benchmarkFarmARate,
    benchmarkFarmBRate: a.benchmarkFarmBRate,
  }));

  await prisma.activity_master.createMany({ data: masterRows, skipDuplicates: true });
  const activitiesRefreshed = await reconcileCatalogRows(
    prisma.activity_master,
    masterRows,
    await prisma.activity_master.findMany({ where: { programId } }),
  );

  let sourceRates = [...catalog.materialRates, ...catalog.serviceRates];
  if (!replace) {
    const existing = await prisma.rate_card_lines.findMany({
      where: { programId, farmEstateId: null },
      select: { resourceCode: true },
    });
    const seen = new Set(existing.map((r) => r.resourceCode));
    sourceRates = sourceRates.filter((line) => !seen.has(line.resourceCode));
  }

  const rateLines = sourceRates.map((line) => ({
    id: uuid("rcl"),
    programId,
    resourceCode: line.resourceCode,
    resourceName: line.resourceName,
    resourceType: line.resourceType,
    unitOfMeasure: line.unitOfMeasure,
    rateEtb: line.rateEtb,
    spxJustificationNote: line.spxJustificationNote,
    status: "approved",
    version: 1,
    approvedAt: now,
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    createdByUserId,
  }));

  if (rateLines.length) {
    await prisma.rate_card_lines.createMany({ data: rateLines });
  }

  return {
    activities: masterRows.length,
    activitiesRefreshed,
    rateCardLines: rateLines.length,
    templates: templateRows.length,
    templatesRefreshed,
    mode: replace ? "replace" : "additive",
  };
}

async function importBagroFarmPortfolio(prisma, ctx) {
  const { programId, silvaOrgId, bagroVendorId } = ctx;

  await clearFarmEstates(prisma, programId);

  const estates = [];

  for (const farm of BAGRO_FARMS) {
    estates.push({
      id: farm.id,
      programId,
      ownerOrganizationId: null,
      name: farm.name,
      totalAreaHa: null,
      location: farm.location,
      notes: `${farm.region} — B-Agro managed portfolio farm`,
      status: "active",
    });
  }

  estates.push({
    id: CHAKA_ESTATE.id,
    programId,
    ownerOrganizationId: silvaOrgId,
    name: CHAKA_ESTATE.name,
    totalAreaHa: CHAKA_ESTATE.totalAreaHa,
    location: CHAKA_ESTATE.location,
    termStartDate: new Date("2026-09-01T00:00:00.000Z"),
    notes: "Silva Forest Coffee — Silva asset, B-Agro execution",
    status: "active",
  });

  for (const estate of estates) {
    await prisma.farm_estates.create({
      data: {
        ...estate,
        vendorMaps: {
          create: {
            id: `fev_${estate.id.replace("fest_", "")}_bagro`,
            vendorId: bagroVendorId,
            isPrimary: true,
          },
        },
      },
    });
  }

  const catalog = loadCatalog();
  const blockRows = catalog.chakaBlocks.map((b) => ({
    id: `blk_chaka_${b.code.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
    programId,
    farmEstateId: CHAKA_ESTATE.id,
    code: b.code,
    label: b.label,
    areaHa: b.areaHa,
    treeCount: b.treeCount,
  }));

  if (blockRows.length) {
    await prisma.farm_blocks.createMany({ data: blockRows });
  }

  for (const farm of BAGRO_FARMS) {
    await prisma.farm_blocks.createMany({
      data: ["A", "B", "C", "D", "E", "F", "G"].map((code) => ({
        id: `blk_${farm.id.replace("fest_", "")}_${code.toLowerCase()}`,
        programId,
        farmEstateId: farm.id,
        code,
        label: `Block ${code}`,
        areaHa: null,
      })),
    });
  }

  const estateIds = estates.map((e) => e.id);
  const perFarmRates = await clonePerFarmRates(prisma, ctx, estateIds);

  return {
    estates: estates.length,
    chakaBlocks: blockRows.length,
    placeholderBlocksPerFarm: 7,
    perFarmRates,
  };
}

async function importCropfortFieldOsAndFarms(prisma, ctx) {
  const catalog = await importCropfortFieldOs(prisma, ctx);
  const farms = await importBagroFarmPortfolio(prisma, ctx);
  return { catalog, farms };
}

module.exports = {
  importCropfortFieldOs,
  importBagroFarmPortfolio,
  importCropfortFieldOsAndFarms,
  clearCropfortCatalog,
  clearFarmEstates,
  clonePerFarmRates,
  reconcileCatalogRows,
};
