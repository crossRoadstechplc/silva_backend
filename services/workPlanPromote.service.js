const { createHash } = require("crypto");
const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { decimal } = require("../utils/helpers");
const { uuid } = require("../utils/ids");

const TX_OPTIONS = { maxWait: 15000, timeout: 120000 };

function dec(v) {
  if (v === null || v === undefined) return null;
  return decimal(v);
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

function activityCodeFrom(act) {
  const raw = String(act.id || act.nameEn || "ACT")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (raw || "ACT").slice(0, 40);
}

function stableLineId(submissionId, blockId, activityId, planYear) {
  const digest = createHash("sha1")
    .update(`${submissionId}:${blockId}:${activityId}:${planYear}`)
    .digest("hex")
    .slice(0, 24);
  return `abl_wp_${digest}`;
}

async function assertApprovedRateCard(programId) {
  const [materialCount, laborCount] = await Promise.all([
    prisma.rate_card_lines.count({ where: { programId, status: "approved" } }),
    prisma.labor_rate_cards.count({ where: { programId, status: "approved" } }),
  ]);
  if (materialCount + laborCount === 0) {
    throw new AppError(
      422,
      "RATE_CARD_REQUIRED",
      "Approve Rate card lines (material/service or labor) before promoting a work plan to Annual plan drafts.",
    );
  }
  return { materialCount, laborCount };
}

async function upsertActivityMaster(tx, programId, act) {
  const code = activityCodeFrom(act);
  const name = String(act.nameEn || code).trim() || code;
  const laborNorm = act.normMdPerUnit != null ? Number(act.normMdPerUnit) : null;
  const laborWage = act.normWageEtb != null ? Number(act.normWageEtb) : null;
  let laborCostPerUnit = null;
  if (laborNorm != null && laborWage != null) laborCostPerUnit = laborNorm * laborWage;
  else if (act.normCostEtb != null) laborCostPerUnit = Number(act.normCostEtb);
  else if (act.annualCostEtb != null && act.annualQuantity) {
    laborCostPerUnit = Number(act.annualCostEtb) / Number(act.annualQuantity);
  }

  const existing = await tx.activity_master.findFirst({
    where: { programId, code },
    orderBy: { version: "desc" },
  });

  if (existing) {
    return tx.activity_master.update({
      where: { id: existing.id },
      data: {
        name,
        laborNorm: laborNorm != null ? dec(laborNorm) : existing.laborNorm,
        laborWageEtb: laborWage != null ? dec(laborWage) : existing.laborWageEtb,
        laborCostPerUnit: laborCostPerUnit != null ? dec(laborCostPerUnit) : existing.laborCostPerUnit,
      },
    });
  }

  return tx.activity_master.create({
    data: {
      id: uuid("act"),
      programId,
      code,
      name,
      laborNorm: laborNorm != null ? dec(laborNorm) : null,
      laborWageEtb: laborWage != null ? dec(laborWage) : null,
      laborCostPerUnit: laborCostPerUnit != null ? dec(laborCostPerUnit) : null,
      version: 1,
    },
  });
}

async function ensureBlocks(tx, { programId, farmEstateId, codes }) {
  const out = [];
  for (const raw of codes) {
    const code = String(raw).trim().toUpperCase();
    if (!code) continue;
    const block = await tx.farm_blocks.upsert({
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
    out.push(block);
  }
  return out;
}

async function upsertDraftBlockLine(tx, {
  id,
  programId,
  planYear,
  blockId,
  activityId,
  plannedQty,
  sequence,
  createdByUserId,
}) {
  const existing = await tx.afp_block_lines.findUnique({ where: { id } });

  if (!existing) {
    await tx.afp_block_lines.create({
      data: {
        id,
        programId,
        planYear,
        blockId,
        activityId,
        plannedQty: dec(plannedQty),
        electionStatus: "suggested",
        status: "draft",
        sequence,
        version: 1,
        createdByUserId,
      },
    });
    return id;
  }

  if (existing.status === "draft") {
    await tx.afp_block_lines.update({
      where: { id },
      data: {
        plannedQty: dec(plannedQty),
        sequence,
        activityId,
        blockId,
        planYear,
      },
    });
    return id;
  }

  // Don't clobber submitted/approved — open a new draft version
  const draftId = uuid("abl");
  await tx.afp_block_lines.create({
    data: {
      id: draftId,
      programId,
      planYear,
      blockId,
      activityId,
      plannedQty: dec(plannedQty),
      electionStatus: "suggested",
      status: "draft",
      sequence,
      version: (existing.version || 1) + 1,
      supersedesId: existing.id,
      createdByUserId,
    },
  });
  return draftId;
}

/**
 * Promote work plan → draft Annual plan (afp_block_lines).
 * Requires approved Rate card. Cost stays Rate-card derived at AFE time.
 */
exports.promoteSubmission = async (submission, { createdByUserId, year }) => {
  const parsed = submission.parsedJson || {};
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const categories = Array.isArray(parsed.categories) ? parsed.categories : [];

  if (!sections.length && !categories.length) {
    throw new AppError(400, "INVALID_PLAN", "Submission has no activities to promote.");
  }
  if (!sections.length) {
    throw new AppError(
      400,
      "INVALID_PLAN",
      "Work plan needs section activities (form or Excel) to create Annual plan drafts.",
    );
  }

  const programId = submission.programId;
  const farmEstateId = submission.farmEstateId || null;
  if (!farmEstateId) {
    throw new AppError(
      400,
      "FARM_REQUIRED",
      "Link a farm estate on the work plan before creating Annual plan drafts.",
    );
  }

  const rateCard = await assertApprovedRateCard(programId);
  const planYear = Number(year) || submission.budgetYearGc;
  if (!planYear) {
    throw new AppError(400, "INVALID_YEAR", "Budget year is required to create Annual plan lines.");
  }

  const estateBlocks = await prisma.farm_blocks.findMany({
    where: { programId, farmEstateId },
    orderBy: { code: "asc" },
  });

  const previousLineIds = parsed.cropfortPromote?.blockLineIds || [];

  return prisma.$transaction(async (tx) => {
    if (previousLineIds.length) {
      await tx.afp_block_lines.deleteMany({
        where: {
          id: { in: previousLineIds },
          programId,
          status: "draft",
        },
      });
    }

    const blockLineIds = [];
    let activityCount = 0;
    let skippedNoQty = 0;
    let sequence = 0;
    const touchedBlockCodes = new Set();

    for (const section of sections) {
      const activities = (section.activities || []).filter((a) => a && (a.nameEn || a.id));
      if (!activities.length) continue;

      const scopeCodes = (section.scope?.blocks || [])
        .map((b) => String(b).trim().toUpperCase())
        .filter(Boolean);
      const codes = scopeCodes.length ? scopeCodes : estateBlocks.map((b) => b.code);
      if (!codes.length) {
        throw new AppError(
          400,
          "BLOCKS_REQUIRED",
          `Section "${section.sectionLabel || section.sectionCode}" has no blocks. Add block scope or farm blocks first.`,
        );
      }

      const blocks = await ensureBlocks(tx, { programId, farmEstateId, codes });
      for (const b of blocks) touchedBlockCodes.add(b.code);

      for (const act of activities) {
        const totalQty = Number(act.annualQuantity) || 0;
        if (!(totalQty > 0)) {
          skippedNoQty += 1;
          continue;
        }

        const activity = await upsertActivityMaster(tx, programId, act);
        activityCount += 1;
        const qtyPerBlock = round4(totalQty / blocks.length) || totalQty;

        for (const block of blocks) {
          sequence += 1;
          const id = stableLineId(submission.id, block.id, activity.id, planYear);
          const lineId = await upsertDraftBlockLine(tx, {
            id,
            programId,
            planYear,
            blockId: block.id,
            activityId: activity.id,
            plannedQty: qtyPerBlock,
            sequence,
            createdByUserId,
          });
          blockLineIds.push(lineId);
        }
      }
    }

    if (!blockLineIds.length) {
      throw new AppError(
        400,
        "INVALID_PLAN",
        skippedNoQty
          ? "No activities with quantity > 0 to promote into Annual plan drafts."
          : "No section activities found to promote into Annual plan drafts.",
      );
    }

    return {
      annualPlanLines: blockLineIds.length,
      activities: activityCount,
      blocks: touchedBlockCodes.size,
      skippedNoQty,
      planYear,
      blockLineIds,
      rateCard,
      annualPlanHref: `/planning/afp?year=${planYear}`,
      afpCount: blockLineIds.length,
      blockCount: touchedBlockCodes.size,
    };
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
