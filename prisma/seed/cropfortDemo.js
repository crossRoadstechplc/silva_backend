/**
 * Cropfort Waves 1–3 demo fixtures for click-path and API verification.
 * Invoked from prisma/seed.js after Cropfort Field OS catalog import.
 */
async function seedCropfortDemo(prisma, ctx) {
  const { programId, principalId, silvaOwnerId, bagroLeadId } = ctx;
  const weekEnding = new Date("2026-08-30T00:00:00.000Z");
  const planYear = 2026;
  const blockA = "blk_chaka_blk_001";
  const blockB = "blk_chaka_blk_002";

  await prisma.spx_validation_checks.deleteMany({ where: { programId } });
  await prisma.weekly_submission_tickets.deleteMany({
    where: { weeklySubmission: { programId } },
  });
  await prisma.weekly_submissions.deleteMany({ where: { programId } });
  await prisma.block_field_tickets.deleteMany({ where: { programId } });
  await prisma.afp_block_lines.deleteMany({ where: { programId } });
  await prisma.cropfort_afes.deleteMany({ where: { programId } });

  const now = new Date();

  const actLand = await prisma.activity_master.findFirst({
    where: { programId, code: "T1-001" },
  });
  const actFert = await prisma.activity_master.findFirst({
    where: { programId, code: "T1-035" },
  });
  const actWeed = await prisma.activity_master.findFirst({
    where: { programId, code: "T1-036" },
  });

  if (!actLand || !actWeed) {
    return {
      weekEnding: "2026-08-30",
      counts: { skipped: true },
    };
  }

  await prisma.rate_card_lines.createMany({
    data: [
      {
        id: "rcl_demo_draft",
        programId,
        resourceCode: "MAT-DEMO-DRAFT",
        resourceName: "Demo draft material (verification)",
        resourceType: "material",
        unitOfMeasure: "kg",
        rateEtb: 120,
        status: "draft",
        version: 1,
        createdByUserId: principalId,
      },
      {
        id: "rcl_demo_submitted",
        programId,
        resourceCode: "MAT-DEMO-SUBMIT",
        resourceName: "Demo submitted material (Silva queue)",
        resourceType: "material",
        unitOfMeasure: "kg",
        rateEtb: 150,
        status: "submitted",
        version: 1,
        submittedAt: now,
        createdByUserId: principalId,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.afp_block_lines.createMany({
    data: [
      {
        id: "abl_demo_land_a",
        programId,
        planYear,
        blockId: blockA,
        activityId: actLand.id,
        electionStatus: "elected",
        sequence: 1,
        plannedQty: 11.5,
        status: "approved",
        version: 1,
        approvedAt: now,
        createdByUserId: principalId,
      },
      {
        id: "abl_demo_weed_b",
        programId,
        planYear,
        blockId: blockB,
        activityId: actWeed.id,
        electionStatus: "suggested",
        sequence: 2,
        plannedQty: 11.5,
        status: "draft",
        version: 1,
        createdByUserId: principalId,
      },
      ...(actFert
        ? [
            {
              id: "abl_demo_fert_sub",
              programId,
              planYear,
              blockId: blockA,
              activityId: actFert.id,
              electionStatus: "elected",
              sequence: 3,
              plannedQty: 11.5,
              status: "submitted",
              version: 1,
              submittedAt: now,
              createdByUserId: principalId,
            },
          ]
        : []),
    ],
  });

  await prisma.block_field_tickets.createMany({
    data: [
      {
        id: "bft_demo_draft",
        programId,
        blockId: blockA,
        activityId: actLand.id,
        weekEnding,
        plannedQty: 11.5,
        actualQty: 10,
        laborHoursActual: 24,
        materialsUsed: { twine_kg: 2 },
        status: "draft",
        submittedByUserId: bagroLeadId,
      },
      {
        id: "bft_demo_submitted",
        programId,
        blockId: blockA,
        activityId: actLand.id,
        weekEnding,
        plannedQty: 11.5,
        actualQty: 11,
        laborHoursActual: 20,
        status: "submitted",
        submittedAt: now,
        submittedByUserId: bagroLeadId,
      },
      {
        id: "bft_demo_reviewed",
        programId,
        blockId: blockA,
        activityId: actLand.id,
        weekEnding,
        plannedQty: 11.5,
        actualQty: 11.5,
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
        title: "Block 01 land clearing overrun",
        amountEtb: 450000,
        band: "A",
        sourceType: "afp_line",
        sourceId: "abl_demo_land_a",
        status: "approved",
        version: 1,
        approvedAt: now,
        createdByUserId: principalId,
      },
      {
        id: "caf_demo_submitted",
        programId,
        title: "Fertilizer top-up — Block 02",
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
        title: "Drying shed facility build",
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
      rateCardApproved: 20,
      afpApprovedElected: 1,
      afpSubmitted: actFert ? 1 : 0,
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
