/**
 * Cropfort Waves 1–3 demo fixtures for click-path and API verification.
 * Invoked from prisma/seed.js after activity master seed.
 */
async function seedCropfortDemo(prisma, ctx) {
  const { programId, principalId, silvaOwnerId, bagroLeadId } = ctx;
  const weekEnding = new Date("2026-08-30T00:00:00.000Z");
  const planYear = 2026;
  const blockA = "blk_shecha_a";
  const blockB = "blk_shecha_b";

  await prisma.spx_validation_checks.deleteMany({ where: { programId } });
  await prisma.weekly_submission_tickets.deleteMany({
    where: { weeklySubmission: { programId } },
  });
  await prisma.weekly_submissions.deleteMany({ where: { programId } });
  await prisma.block_field_tickets.deleteMany({ where: { programId } });
  await prisma.afp_block_lines.deleteMany({ where: { programId } });
  await prisma.rate_card_lines.deleteMany({ where: { programId } });
  await prisma.cropfort_afes.deleteMany({ where: { programId } });

  const now = new Date();

  await prisma.rate_card_lines.createMany({
    data: [
      {
        id: "rcl_demo_prune",
        programId,
        resourceCode: "PRUNE-01",
        resourceName: "Primary pruning",
        unitOfMeasure: "tree",
        rateEtb: 150,
        benchmarkFarmARate: 140,
        benchmarkFarmBRate: 145,
        status: "approved",
        version: 1,
        approvedAt: now,
        createdByUserId: principalId,
      },
      {
        id: "rcl_demo_fert",
        programId,
        resourceCode: "FERT-01",
        resourceName: "Fertilizer application",
        unitOfMeasure: "ha",
        rateEtb: 3200,
        benchmarkFarmARate: 3000,
        benchmarkFarmBRate: 3100,
        status: "submitted",
        version: 1,
        submittedAt: now,
        createdByUserId: principalId,
      },
      {
        id: "rcl_demo_weed",
        programId,
        resourceCode: "WEED-01",
        resourceName: "Weeding",
        unitOfMeasure: "ha",
        rateEtb: 1800,
        benchmarkFarmARate: 1700,
        benchmarkFarmBRate: 1750,
        status: "draft",
        version: 1,
        createdByUserId: principalId,
      },
    ],
  });

  await prisma.afp_block_lines.createMany({
    data: [
      {
        id: "abl_demo_prune_a",
        programId,
        planYear,
        blockId: blockA,
        activityId: "act_prune",
        electionStatus: "elected",
        sequence: 1,
        plannedQty: 1200,
        status: "approved",
        version: 1,
        approvedAt: now,
        createdByUserId: principalId,
      },
      {
        id: "abl_demo_fert_b",
        programId,
        planYear,
        blockId: blockB,
        activityId: "act_fert",
        electionStatus: "suggested",
        sequence: 2,
        plannedQty: 8.5,
        status: "draft",
        version: 1,
        createdByUserId: principalId,
      },
      {
        id: "abl_demo_weed_sub",
        programId,
        planYear,
        blockId: blockA,
        activityId: "act_weed",
        electionStatus: "elected",
        sequence: 3,
        plannedQty: 4,
        status: "submitted",
        version: 1,
        submittedAt: now,
        createdByUserId: principalId,
      },
    ],
  });

  await prisma.block_field_tickets.createMany({
    data: [
      {
        id: "bft_demo_draft",
        programId,
        blockId: blockA,
        activityId: "act_prune",
        weekEnding,
        plannedQty: 100,
        actualQty: 95,
        laborHoursActual: 24,
        materialsUsed: { twine_kg: 2 },
        status: "draft",
        submittedByUserId: bagroLeadId,
      },
      {
        id: "bft_demo_submitted",
        programId,
        blockId: blockA,
        activityId: "act_prune",
        weekEnding,
        plannedQty: 80,
        actualQty: 82,
        laborHoursActual: 20,
        status: "submitted",
        submittedAt: now,
        submittedByUserId: bagroLeadId,
      },
      {
        id: "bft_demo_reviewed",
        programId,
        blockId: blockA,
        activityId: "act_prune",
        weekEnding,
        plannedQty: 50,
        actualQty: 48,
        laborHoursActual: 12,
        status: "reviewed_approved",
        submittedAt: now,
        submittedByUserId: bagroLeadId,
      },
    ],
  });

  await prisma.weekly_submissions.create({
    data: {
      id: "wks_demo_0830",
      programId,
      weekEnding,
      status: "submitted",
      submittedAt: now,
      tickets: {
        create: [
          { id: "wst_demo_1", blockFieldTicketId: "bft_demo_submitted" },
          { id: "wst_demo_2", blockFieldTicketId: "bft_demo_reviewed" },
        ],
      },
    },
  });

  await prisma.cropfort_afes.createMany({
    data: [
      {
        id: "caf_demo_approved",
        programId,
        title: "Block A pruning overrun",
        amountEtb: 450000,
        band: "A",
        sourceType: "afp_line",
        sourceId: "abl_demo_prune_a",
        status: "approved",
        version: 1,
        approvedAt: now,
        createdByUserId: principalId,
      },
      {
        id: "caf_demo_submitted",
        programId,
        title: "Fertilizer top-up — Block B",
        amountEtb: 1850000,
        band: "B",
        sourceType: "manual",
        status: "submitted",
        version: 1,
        submittedAt: now,
        createdByUserId: principalId,
      },
      {
        id: "caf_demo_draft",
        programId,
        title: "Emergency irrigation repair",
        amountEtb: 6200000,
        band: "D",
        sourceType: "intervention",
        status: "draft",
        version: 1,
        createdByUserId: principalId,
      },
    ],
  });

  return {
    weekEnding: "2026-08-30",
    counts: {
      rateCardApproved: 1,
      rateCardSubmitted: 1,
      rateCardDraft: 1,
      afpApprovedElected: 1,
      afpSubmitted: 1,
      ticketsDraft: 1,
      ticketsSubmitted: 1,
      weeklySubmissions: 1,
      cropfortAfesApproved: 1,
      cropfortAfesSubmitted: 1,
      cropfortAfesDraft: 1,
    },
  };
}

module.exports = { seedCropfortDemo };
