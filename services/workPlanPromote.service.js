const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { decimal } = require("../utils/helpers");

const BATCH_SIZE = 500;
const TX_OPTIONS = { maxWait: 15000, timeout: 120000 };

function dec(v) {
  if (v === null || v === undefined) return null;
  return decimal(v);
}

async function createManyInChunks(model, rows) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await model.createMany({ data: rows.slice(i, i + BATCH_SIZE), skipDuplicates: true });
  }
}

/**
 * Promote an accepted work plan submission into AFP lines, activity catalog, and schedules.
 */
exports.promoteSubmission = async (submission, { createdByUserId, year }) => {
  const parsed = submission.parsedJson;
  if (!parsed?.categories?.length) {
    throw new AppError(400, "INVALID_PLAN", "Submission has no parsed categories to promote.");
  }

  const programId = submission.programId;
  const farmEstateId = submission.farmEstateId || null;

  const afpLineScheduleRows = [];
  const catalogRows = [];
  const scheduleRows = [];
  const blockCodes = new Set();
  const afpLineIds = new Set();

  for (const cat of parsed.categories) {
    if (!cat.afpLineId || !cat.budgetEtb) continue;
    afpLineIds.add(cat.afpLineId);

    for (const row of cat.monthlySchedule || []) {
      if (!row.plannedCostEtb) continue;
      afpLineScheduleRows.push({
        id: `als_${cat.afpLineId}_${year}_${row.month}`,
        programId,
        afpLineId: cat.afpLineId,
        year,
        month: row.month,
        plannedCostEtb: dec(row.plannedCostEtb),
        plannedCostUsd: dec(row.plannedCostEtb),
      });
    }
  }

  for (const section of parsed.sections || []) {
    const afpLineId = section.afpLineId;
    if (!afpLineIds.has(afpLineId) && !parsed.categories.find((c) => c.afpLineId === afpLineId)) continue;

    let sortOrder = 0;
    for (const act of section.activities || []) {
      sortOrder += 1;
      catalogRows.push({
        id: act.id,
        programId,
        afpLineId,
        sectionCode: section.sectionCode,
        sectionLabel: section.sectionLabel,
        sortOrder,
        nameEn: act.nameEn,
        nameAm: act.nameAm || null,
        unit: act.unit,
        normMdPerUnit: dec(act.normMdPerUnit),
        normCostEtb:
          act.annualCostEtb && act.annualQuantity
            ? dec(act.annualCostEtb / act.annualQuantity)
            : dec(act.normCostEtb),
        normWageEtb: dec(act.normWageEtb),
        normsPerMd: dec(act.normsPerMd),
        annualQuantity: dec(act.annualQuantity),
        annualMandays: dec(act.annualMandays),
        annualCostEtb: dec(act.annualCostEtb),
        scopeJson: section.scope || null,
      });

      for (const row of act.schedule || []) {
        scheduleRows.push({
          id: `sch_${act.id}_${year}_${row.month}`,
          activityCatalogId: act.id,
          programId,
          year,
          month: row.month,
          plannedQuantity: dec(row.quantity),
          plannedMandays: dec(row.mandays),
          plannedCostEtb: dec(row.costEtb ?? row.plannedCostEtb),
        });
      }
    }

    for (const code of section.scope?.blocks || []) blockCodes.add(code);
  }

  return prisma.$transaction(async (tx) => {
    await tx.activity_schedule.deleteMany({ where: { programId } });
    await tx.activity_catalog.deleteMany({ where: { programId } });
    await tx.afp_line_schedules.deleteMany({ where: { programId } });

    await tx.afp_lines.deleteMany({
      where: { programId, year, workPlanSubmissionId: submission.id },
    });

    for (const cat of parsed.categories) {
      if (!cat.afpLineId || !cat.budgetEtb) continue;
      const budgetEtb = dec(cat.budgetEtb);
      await tx.afp_lines.upsert({
        where: { id: cat.afpLineId },
        create: {
          id: cat.afpLineId,
          programId,
          year,
          operatingDiscipline: cat.operatingDiscipline,
          activity: cat.activity,
          budgetAllocatedUsd: budgetEtb,
          budgetAllocatedEtb: budgetEtb,
          kpiTarget: cat.kpiTarget || "Per B-Agro submitted plan",
          status: "draft",
          silvaApproved: false,
          notes: `Promoted from work plan ${submission.id} · ${cat.budgetEtb.toLocaleString()} ETB`,
          workPlanSubmissionId: submission.id,
          createdByUserId,
        },
        update: {
          operatingDiscipline: cat.operatingDiscipline,
          activity: cat.activity,
          budgetAllocatedUsd: budgetEtb,
          budgetAllocatedEtb: budgetEtb,
          kpiTarget: cat.kpiTarget || "Per B-Agro submitted plan",
          workPlanSubmissionId: submission.id,
          notes: `Promoted from work plan ${submission.id} · ${cat.budgetEtb.toLocaleString()} ETB`,
        },
      });
    }

    await createManyInChunks(tx.afp_line_schedules, afpLineScheduleRows);
    await createManyInChunks(tx.activity_catalog, catalogRows);
    await createManyInChunks(tx.activity_schedule, scheduleRows);

    if (blockCodes.size) {
      if (!farmEstateId) {
        throw new AppError(
          400,
          "INVALID_PLAN",
          "Work plan must be linked to a farm estate before block codes can be promoted.",
        );
      }
      for (const raw of blockCodes) {
        const code = String(raw).trim().toUpperCase();
        if (!code) continue;
        await tx.farm_blocks.upsert({
          where: {
            programId_farmEstateId_code: { programId, farmEstateId, code },
          },
          create: {
            id: `blk_${farmEstateId}_${code.toLowerCase()}`,
            programId,
            farmEstateId,
            code,
            label: `Block ${code}`,
          },
          update: {},
        });
      }
    }

    return { afpCount: afpLineIds.size, blockCount: blockCodes.size };
  }, TX_OPTIONS);
};

exports.getAfpLineSchedule = async (afpLineId, user) => {
  const { scopedWhere, requireProgramId } = require("./utils/programScope");
  requireProgramId(user);
  const line = await prisma.afp_lines.findFirst({ where: scopedWhere(user, { id: afpLineId }) });
  if (!line) throw new AppError(404, "NOT_FOUND", "AFP line not found.");

  const rows = await prisma.afp_line_schedules.findMany({
    where: { afpLineId, programId: line.programId },
    orderBy: { month: "asc" },
  });

  return {
    afpLineId,
    year: line.year,
    budgetAllocatedEtb: Number(line.budgetAllocatedEtb ?? line.budgetAllocatedUsd),
    months: rows.map((r) => ({
      month: r.month,
      plannedCostEtb: Number(r.plannedCostEtb ?? r.plannedCostUsd ?? 0),
    })),
  };
};
