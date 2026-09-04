const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PASSWORD = "Password123!";
const PROGRAM_ID = "prg_shecha";

/** Delete rows when the table exists; ignore missing tables (pre-migration). */
async function deleteManySafe(modelName) {
  try {
    await prisma[modelName].deleteMany();
  } catch {
    /* table may not exist before migration */
  }
}

async function resetDatabase() {
  await prisma.gl_journal_export_lines.deleteMany();
  await prisma.gl_journal_exports.deleteMany();

  // Cropfort tables reference farm_blocks — delete them before blocks/estates.
  await deleteManySafe("spx_validation_checks");
  await deleteManySafe("weekly_submission_tickets");
  await deleteManySafe("weekly_submissions");
  await deleteManySafe("block_field_tickets");
  await deleteManySafe("afp_block_lines");
  await deleteManySafe("rate_card_lines");
  await deleteManySafe("activity_master");
  await deleteManySafe("activity_templates");
  await deleteManySafe("cropfort_afes");
  await deleteManySafe("core_operation_projects");
  await deleteManySafe("cropfort_user_roles");

  await deleteManySafe("activity_schedule");
  await deleteManySafe("activity_catalog");
  await deleteManySafe("afp_line_schedules");
  await deleteManySafe("work_order_block_assignments");
  await deleteManySafe("farm_estate_vendors");
  await deleteManySafe("farm_blocks");
  await deleteManySafe("farm_estates");
  await deleteManySafe("work_plan_submissions");

  await prisma.audit_log.deleteMany();
  await prisma.notifications.deleteMany();
  await prisma.attachments.deleteMany();
  await prisma.ifs_forms.deleteMany();
  await prisma.season_windows.deleteMany();
  await prisma.season_calendars.deleteMany();
  await prisma.gl_journal_export_lines.deleteMany();
  await prisma.gl_journal_exports.deleteMany();
  await prisma.reports.deleteMany();
  try {
    await prisma.message_thread_reads.deleteMany();
    await prisma.messages.deleteMany();
    await prisma.message_threads.deleteMany();
    await deleteManySafe("core_operation_projects");
    await prisma.activity_requests.deleteMany();
    await prisma.item_comments.deleteMany();
  } catch {
    /* tables may not exist before migration */
  }
  await prisma.owner_settlements.deleteMany();
  await prisma.payment_requests.deleteMany();
  await prisma.field_tickets.deleteMany();
  await prisma.work_order_tasks.deleteMany();
  await prisma.work_order_assignments.deleteMany();
  await prisma.work_orders.deleteMany();
  await prisma.vendor_contracts.deleteMany();
  await prisma.vendor_scorecards.deleteMany();
  await prisma.afes.deleteMany();
  await prisma.afp_lines.deleteMany();
  await prisma.spx_revenue_ledger.deleteMany();
  await prisma.refresh_sessions.deleteMany();
  await prisma.program_org_invites.deleteMany();
  await prisma.invites.deleteMany();
  await prisma.organization_memberships.deleteMany();
  await prisma.users.deleteMany();
  await prisma.vendors.deleteMany();
  await prisma.program_memberships.deleteMany();
  await prisma.schedule3_thresholds.deleteMany();
  await prisma.schedule4_insurance.deleteMany();
  await prisma.accountability_matrix.deleteMany();
  await prisma.harvest_kpi_snapshots.deleteMany();
  await prisma.platform_config.deleteMany();
  await prisma.related_party_disclosures.deleteMany();
  await prisma.coa_mapping.deleteMany();
  await prisma.programs.deleteMany();
  await prisma.organizations.deleteMany();
  await prisma.id_sequences.deleteMany();
  try {
    await prisma.contact_submissions.deleteMany();
    await prisma.registration_requests.deleteMany();
  } catch {
    /* table may not exist before migration */
  }
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  await resetDatabase();

  const silva = await prisma.organizations.create({
    data: {
      id: "org_silva",
      name: "Silva",
      slug: "silva",
      displayName: "Silva",
      type: "silva",
      brandingJson: { primaryColor: "#166534", tagline: "Estate governance" },
    },
  });
  const spx = await prisma.organizations.create({
    data: {
      id: "org_spx",
      name: "SPX",
      slug: "spx",
      displayName: "SPX Management",
      type: "spx",
      brandingJson: { primaryColor: "#166534", tagline: "Field operations management" },
    },
  });
  const bagroOrg = await prisma.organizations.create({
    data: {
      id: "org_bagro",
      name: "B-Agro Coffee Development PLC",
      slug: "b-agro",
      displayName: "B-Agro",
      type: "vendor",
      isDefaultExecutionPartner: true,
      brandingJson: { primaryColor: "#1d4ed8", tagline: "Field execution" },
    },
  });

  const program = await prisma.programs.create({
    data: {
      id: PROGRAM_ID,
      name: "Shecha Estate",
      slug: "shecha-estate",
      createdByOrgId: spx.id,
      brandingJson: { tagline: "Kaffa Zone turnaround" },
      // Chaka Buna alone is 230 ha (20 blocks x 11.5 ha) per the Master sheet.
      cropfortHectareContractTotal: 230,
      cropfortOpexReserveBalanceEtb: 15000000,
    },
  });

  await prisma.program_memberships.createMany({
    data: [
      { id: "pm_silva", programId: program.id, organizationId: silva.id, roleInProgram: "owner" },
      { id: "pm_spx", programId: program.id, organizationId: spx.id, roleInProgram: "manager" },
      { id: "pm_bagro", programId: program.id, organizationId: bagroOrg.id, roleInProgram: "executor" },
    ],
  });

  const bagro = await prisma.vendors.create({
    data: {
      id: "vnd_bagro",
      organizationId: bagroOrg.id,
      name: "B-Agro Coffee Development PLC",
      category: "Agronomic Operations",
      servicesProvided: "Agronomy, harvest execution, processing oversight",
      prequalified: true,
      insuranceOnFile: true,
      insuranceExpiry: new Date("2026-12-31T00:00:00.000Z"),
      status: "active",
      isDefaultExecutionPartner: true,
    },
  });

  async function user(id, name, email, role, orgId, vendorId) {
    return prisma.users.create({
      data: {
        id,
        name,
        email,
        passwordHash: hash,
        role,
        organizationId: orgId,
        vendorId: vendorId || null,
        activeProgramId: program.id,
        memberships: { create: { id: `mem_${id}`, organizationId: orgId, role } },
      },
    });
  }

  await user("usr_silva_owner", "Silva Owner", "owner@silva.example", "silva_owner", silva.id);
  await user("usr_silva_cm", "Naomi Tesfaye", "naomi@silva.example", "silva_country_manager", silva.id);
  await user("usr_silva_fin", "Silva Finance", "finance@silva.example", "silva_finance", silva.id);
  const principal = await user("usr_spx_principal", "SPX Principal", "principal@spx.example", "spx_principal", spx.id);
  const handler = await user("usr_spx_handler", "SPX Handler", "handler@spx.example", "spx_account_handler", spx.id);
  await user("usr_spx_supervisor", "SPX Field Supervisor", "supervisor@spx.example", "spx_field_supervisor", spx.id);
  await user("usr_spx_admin", "System Admin", "admin@spx.example", "system_admin", spx.id);
  await user("usr_bagro_admin", "B-Agro Admin", "admin@bagro.example", "vendor_admin", bagroOrg.id, bagro.id);
  const lead = await user("usr_bagro_lead", "Dawit Bekele", "lead@bagro.example", "vendor_field_lead", bagroOrg.id, bagro.id);
  await user("usr_bagro_super", "B-Agro Supervisor", "supervisor@bagro.example", "vendor_supervisor", bagroOrg.id, bagro.id);
  await user("usr_bagro_worker", "B-Agro Worker", "worker@bagro.example", "vendor_worker", bagroOrg.id, bagro.id);

  try {
    const { importCropfortFieldOsAndFarms } = require("../lib/cropfortFieldOsSeed");
    const imported = await importCropfortFieldOsAndFarms(prisma, {
      programId: program.id,
      silvaOrgId: silva.id,
      bagroVendorId: bagro.id,
      createdByUserId: principal.id,
    });
    console.log("Cropfort Field OS catalog:", imported.catalog);
    console.log("B-Agro farm portfolio:", imported.farms);
  } catch (e) {
    console.warn("Cropfort Field OS import skipped:", e.message);
  }

  await prisma.schedule3_thresholds.createMany({
    data: [
      { programId: program.id, band: "A", minValueUsd: 0, maxValueUsd: 5000, spxAuthority: "Decide and issue AFE directly within approved AFP budget", silvaAuthority: "Informed in the monthly report", effectiveYear: 2026 },
      { programId: program.id, band: "B", minValueUsd: 5001, maxValueUsd: 20000, spxAuthority: "Issue AFE; Silva notified with objection window", silvaAuthority: "Informed; may object", effectiveYear: 2026 },
      { programId: program.id, band: "C", minValueUsd: 20001, maxValueUsd: 50000, spxAuthority: "Recommend", silvaAuthority: "Approve before issue", effectiveYear: 2026 },
      { programId: program.id, band: "D", minValueUsd: 50001, maxValueUsd: null, spxAuthority: "Recommend", silvaAuthority: "Approve before issue", effectiveYear: 2026 },
    ],
  });

  await prisma.schedule4_insurance.create({
    data: {
      id: "ins_01",
      programId: program.id,
      party: "B-Agro (Execution Contractor)",
      coverageType: "Employer's liability",
      minimumCoverageUsd: 200000,
      beneficiary: "Silva named as additional insured",
    },
  });

  await prisma.accountability_matrix.createMany({
    data: [
      {
        programId: program.id,
        operatingDiscipline: "Agronomic Operations",
        executeRole: "B-Agro",
        validateRole: "SPX",
        decideRole: "SPX",
        authorRole: "SPX",
        schedule3Ref: "AFE Bands A-D",
      },
      {
        programId: program.id,
        operatingDiscipline: "Procurement & Tender",
        executeRole: "SPX",
        validateRole: "SPX",
        decideRole: "Silva (Band C/D)",
        authorRole: "SPX",
        schedule3Ref: "Procurement / tender",
      },
      {
        programId: program.id,
        operatingDiscipline: "Contractor Appointment",
        executeRole: "SPX",
        validateRole: "SPX",
        decideRole: "Silva",
        authorRole: "SPX",
        schedule3Ref: "Vendor appointment / removal",
      },
      {
        programId: program.id,
        operatingDiscipline: "Emergency / Stop-Work",
        executeRole: "Field / SPX",
        validateRole: "SPX",
        decideRole: "SPX (immediate)",
        authorRole: "SPX",
        schedule3Ref: "Safety override",
      },
      {
        programId: program.id,
        operatingDiscipline: "Hiring",
        executeRole: "B-Agro",
        validateRole: "SPX",
        decideRole: "SPX",
        authorRole: "SPX",
        schedule3Ref: "Labor controls",
      },
      {
        programId: program.id,
        operatingDiscipline: "Reporting Sign-Off",
        executeRole: "SPX",
        validateRole: "SPX Principal",
        decideRole: "SPX Principal",
        authorRole: "SPX",
        schedule3Ref: "Schedule 5 cadence",
      },
      {
        programId: program.id,
        operatingDiscipline: "Infrastructure",
        executeRole: "Vendor",
        validateRole: "SPX",
        decideRole: "Silva (Band C/D)",
        authorRole: "SPX",
        schedule3Ref: "AFE Bands C-D",
      },
    ],
  });

  await prisma.platform_config.create({
    data: { programId: program.id, fxRateEtbPerUsd: 57.2, enhancedGovernanceActive: true },
  });

  await prisma.harvest_kpi_snapshots.create({
    data: {
      id: "kpi_2026",
      programId: program.id,
      year: 2026,
      pickerProductivityCurrent: 38.2,
      yieldTrendVsBaselinePercent: -4.1,
    },
  });

  await prisma.related_party_disclosures.create({
    data: {
      id: "rpd_01",
      programId: program.id,
      party: "B-Agro",
      relationship: "Disclosed associate of the Manager",
      period: "2026",
      notes: "Schedule 6 disclosure",
    },
  });

  await prisma.coa_mapping.createMany({
    data: [
      { id: "coa_01", sourceAccount: "AFP-pruning", glAccount: "6100-Field Operations", description: "Pruning program spend" },
      { id: "coa_02", sourceAccount: "AFP-fertilizer", glAccount: "6120-Inputs", description: "Fertilizer and soil amendment" },
      { id: "coa_03", sourceAccount: "AFP-harvest", glAccount: "6200-Harvest Labor", description: "Seasonal harvest labor" },
      { id: "coa_04", sourceAccount: "AFP-infra", glAccount: "6400-Infrastructure", description: "Washing station and roads" },
    ],
  });

  const afpPruning = await prisma.afp_lines.create({
    data: {
      id: "AFP-2026-001",
      programId: program.id,
      year: 2026,
      operatingDiscipline: "Agronomic Operations",
      activity: "Farm-wide pruning & topping schedule",
      budgetAllocatedUsd: 42000,
      kpiTarget: "100% of neglected blocks pruned by Q2",
      status: "approved",
      silvaApproved: true,
      approvalDate: new Date("2026-01-05T00:00:00.000Z"),
      notes: "Year 1 priority per assessment",
      createdByUserId: principal.id,
    },
  });
  const afpFert = await prisma.afp_lines.create({
    data: {
      id: "AFP-2026-002",
      programId: program.id,
      year: 2026,
      operatingDiscipline: "Agronomic Operations",
      activity: "Soil amendment & fertilizer campaign (Blocks 5–12)",
      budgetAllocatedUsd: 28500,
      kpiTarget: "Apply full nutrient package before rains",
      status: "approved",
      silvaApproved: true,
      approvalDate: new Date("2026-01-18T00:00:00.000Z"),
      notes: "Aligned with seasonal calendar Q1–Q2",
      createdByUserId: principal.id,
    },
  });
  const afpHarvest = await prisma.afp_lines.create({
    data: {
      id: "AFP-2026-003",
      programId: program.id,
      year: 2026,
      operatingDiscipline: "Harvest Operations",
      activity: "Main harvest labor & cherry logistics",
      budgetAllocatedUsd: 61000,
      kpiTarget: "Hold picker productivity ≥ 40 kg/day",
      status: "approved",
      silvaApproved: true,
      approvalDate: new Date("2026-02-01T00:00:00.000Z"),
      notes: "Peak season Q3–Q4",
      createdByUserId: principal.id,
    },
  });
  const afpInfra = await prisma.afp_lines.create({
    data: {
      id: "AFP-2026-004",
      programId: program.id,
      year: 2026,
      operatingDiscipline: "Infrastructure",
      activity: "Washing station rehab & farm roads",
      budgetAllocatedUsd: 55000,
      kpiTarget: "Station online before peak cherry intake",
      status: "approved",
      silvaApproved: true,
      approvalDate: new Date("2026-01-22T00:00:00.000Z"),
      notes: "Band C/D capital path",
      createdByUserId: principal.id,
    },
  });
  await prisma.afp_lines.create({
    data: {
      id: "AFP-2027-001",
      programId: program.id,
      year: 2027,
      operatingDiscipline: "Agronomic Operations",
      activity: "Year 2 canopy management & replanting pockets",
      budgetAllocatedUsd: 38000,
      kpiTarget: "Close remaining neglected pockets",
      status: "draft",
      silvaApproved: false,
      notes: "Draft year-line for planning demos",
      createdByUserId: principal.id,
    },
  });
  await prisma.id_sequences.create({ data: { name: "afp-2026", lastValue: 4 } });
  await prisma.id_sequences.create({ data: { name: "afp-2027", lastValue: 1 } });

  const afe = await prisma.afes.create({
    data: {
      id: "AFE-0001",
      programId: program.id,
      afpLineId: afpPruning.id,
      operatingDiscipline: "Agronomic Operations",
      description: "Pruning Blocks 1 to 4",
      estimatedCostUsd: 4500,
      band: "A",
      spxValidated: true,
      silvaApprovalRequired: false,
      silvaApproved: false,
      approvalDate: new Date("2026-01-12T00:00:00.000Z"),
      status: "approved",
      createdByUserId: handler.id,
    },
  });
  await prisma.afes.create({
    data: {
      id: "AFE-0002",
      programId: program.id,
      afpLineId: afpFert.id,
      operatingDiscipline: "Agronomic Operations",
      description: "Fertilizer delivery Blocks 5–8",
      estimatedCostUsd: 12500,
      band: "B",
      spxValidated: true,
      silvaApprovalRequired: false,
      status: "approved",
      approvalDate: new Date("2026-02-05T00:00:00.000Z"),
      createdByUserId: handler.id,
    },
  });
  await prisma.afes.create({
    data: {
      id: "AFE-0003",
      programId: program.id,
      afpLineId: afpInfra.id,
      operatingDiscipline: "Infrastructure",
      description: "Washing station inspection and minor rehabilitation",
      estimatedCostUsd: 32000,
      band: "C",
      spxValidated: true,
      silvaApprovalRequired: true,
      status: "validated",
      createdByUserId: handler.id,
    },
  });
  await prisma.afes.create({
    data: {
      id: "AFE-0004",
      programId: program.id,
      afpLineId: afpHarvest.id,
      operatingDiscipline: "Harvest Operations",
      description: "Peak harvest labor mobilization (Week 28–36)",
      estimatedCostUsd: 48000,
      band: "C",
      spxValidated: false,
      silvaApprovalRequired: true,
      status: "submitted",
      createdByUserId: handler.id,
    },
  });
  await prisma.id_sequences.create({ data: { name: "afe", lastValue: 4 } });

  const wo = await prisma.work_orders.create({
    data: {
      id: "WO-0001",
      programId: program.id,
      afeId: afe.id,
      category: "Agronomic Operations",
      activity: "Scheduled pruning of Blocks 1 to 4",
      tier: "retainer",
      weekStart: 3,
      weekEnd: 6,
      spxOversightHoursL1: 4,
      spxOversightHoursL2: 2,
      assignedVendorId: bagro.id,
      status: "issued",
    },
  });
  await prisma.work_orders.create({
    data: {
      id: "WO-0002",
      programId: program.id,
      afeId: "AFE-0002",
      category: "Agronomic Operations",
      activity: "Fertilizer application Blocks 5–8",
      tier: "project",
      weekStart: 8,
      weekEnd: 12,
      spxOversightHoursL1: 6,
      spxOversightHoursL2: 3,
      assignedVendorId: bagro.id,
      status: "draft",
    },
  });
  await prisma.id_sequences.create({ data: { name: "wo", lastValue: 2 } });

  await prisma.work_order_assignments.create({
    data: { id: "woa_01", workOrderId: wo.id, userId: lead.id, roleOnOrder: "vendor_field_lead", isPrimary: true },
  });

  await prisma.vendor_contracts.create({
    data: {
      id: "vct_01",
      vendorId: bagro.id,
      afeId: afe.id,
      contractValueUsd: 4500,
      procurementRoute: "sole_source",
      tenderStatus: "n_a",
      contractStart: new Date("2026-01-10T00:00:00.000Z"),
      contractEnd: new Date("2026-03-31T00:00:00.000Z"),
    },
  });
  await prisma.vendor_contracts.create({
    data: {
      id: "vct_02",
      vendorId: bagro.id,
      afeId: "AFE-0003",
      contractValueUsd: 32000,
      procurementRoute: "competitive_tender",
      tenderStatus: "in_progress",
      contractStart: new Date("2026-03-01T00:00:00.000Z"),
      contractEnd: new Date("2026-08-31T00:00:00.000Z"),
    },
  });

  const calendar = await prisma.season_calendars.create({
    data: {
      id: "cal_2026",
      programId: program.id,
      year: 2026,
      name: "Shecha Year 1 operating calendar",
      status: "active",
      notes: "SPX-issued seasonal windows for B-Agro execution.",
      createdByUserId: principal.id,
    },
  });
  await prisma.season_windows.createMany({
    data: [
      {
        id: "cwin_01",
        calendarId: calendar.id,
        programId: program.id,
        operatingDiscipline: "Agronomic Operations",
        activity: "Farm-wide pruning & topping",
        weekStart: 3,
        weekEnd: 10,
        status: "in_progress",
        linkedWorkOrderId: wo.id,
        issuedAt: new Date("2026-01-10T00:00:00.000Z"),
        notes: "Linked to WO-0001",
      },
      {
        id: "cwin_02",
        calendarId: calendar.id,
        programId: program.id,
        operatingDiscipline: "Agronomic Operations",
        activity: "Fertilizer & soil amendment",
        weekStart: 8,
        weekEnd: 14,
        status: "issued",
        linkedWorkOrderId: "WO-0002",
        issuedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
      {
        id: "cwin_03",
        calendarId: calendar.id,
        programId: program.id,
        operatingDiscipline: "Infrastructure",
        activity: "Washing station rehab window",
        weekStart: 12,
        weekEnd: 22,
        status: "planned",
      },
      {
        id: "cwin_04",
        calendarId: calendar.id,
        programId: program.id,
        operatingDiscipline: "Harvest Operations",
        activity: "Main cherry harvest",
        weekStart: 28,
        weekEnd: 40,
        status: "planned",
      },
      {
        id: "cwin_05",
        calendarId: calendar.id,
        programId: program.id,
        operatingDiscipline: "Harvest Operations",
        activity: "Late pick & post-harvest close",
        weekStart: 40,
        weekEnd: 46,
        status: "planned",
      },
    ],
  });

  await prisma.ifs_forms.createMany({
    data: [
      {
        id: "ifs_01",
        programId: program.id,
        formType: "daily_work_log",
        title: "Daily work log — Blocks 1–4",
        workOrderId: wo.id,
        blockRef: "B1-B4",
        weekNumber: 4,
        payload: { crewCount: 18, hoursWorked: 8, blocks: "1-4", summary: "Pruning progressing on schedule" },
        status: "validated",
        submittedByUserId: lead.id,
        validatedByUserId: handler.id,
        notes: "Linked to WO-0001",
      },
      {
        id: "ifs_02",
        programId: program.id,
        formType: "pruning_completion",
        title: "Pruning completion — Block 2",
        workOrderId: wo.id,
        blockRef: "B2",
        weekNumber: 5,
        payload: { blockRef: "B2", treesCompleted: 420, qualityNotes: "Canopy height within target" },
        status: "submitted",
        submittedByUserId: lead.id,
      },
      {
        id: "ifs_03",
        programId: program.id,
        formType: "weather_field_readiness",
        title: "Field readiness — Week 8",
        weekNumber: 8,
        payload: { rainfallMm: 12, soilCondition: "workable", readyToWork: true },
        status: "draft",
        submittedByUserId: lead.id,
      },
    ],
  });

  await prisma.vendor_scorecards.create({
    data: {
      id: "vsc_01",
      vendorId: bagro.id,
      reviewPeriod: "Q1 2026",
      qualityScore: 82,
      timelinessScore: 78,
      costAdherenceScore: 80,
      overallScore: 80,
      reviewedByUserId: handler.id,
      notes: "On track against Year 1 pruning quality.",
    },
  });

  await prisma.spx_revenue_ledger.create({
    data: {
      id: "INV-0001",
      programId: program.id,
      period: "2026-01",
      tier: "retainer",
      feeDescription: "Year 1 Main Figure monthly recognition",
      amountEtb: 0,
      amountUsd: 16250,
      invoiceDate: new Date("2026-01-31T00:00:00.000Z"),
      paymentStatus: "invoiced",
    },
  });
  await prisma.id_sequences.create({ data: { name: "inv", lastValue: 1 } });
  await prisma.id_sequences.create({ data: { name: "pr", lastValue: 0 } });
  await prisma.id_sequences.create({ data: { name: "stl", lastValue: 0 } });

  await prisma.notifications.createMany({
    data: [
      {
        id: "ntf_demo_silva",
        programId: program.id,
        triggerType: "afe_pending",
        entityType: "afe",
        entityId: "AFE-0003",
        recipientRole: "silva_owner",
        recipientUserId: "usr_silva_owner",
        message: "Band C AFE AFE-0003 is awaiting Silva approval.",
      },
      {
        id: "ntf_demo_spx",
        programId: program.id,
        triggerType: "ft_vendor_reviewed",
        entityType: "field_ticket",
        entityId: "FT-0001",
        recipientRole: "spx_field_supervisor",
        recipientUserId: "usr_spx_supervisor",
        message: "Field ticket FT-0001 passed vendor review — SPX validation required.",
      },
      {
        id: "ntf_demo_vendor",
        programId: program.id,
        triggerType: "wo_issued",
        entityType: "work_order",
        entityId: "WO-0001",
        recipientRole: "vendor_field_lead",
        recipientUserId: lead.id,
        message: "Work order WO-0001 issued — ready for field execution.",
      },
    ],
  });

  try {
    await prisma.cropfort_user_roles.createMany({
      data: [
        { id: "cfr_spx", programId: program.id, userId: principal.id, role: "spx_validator" },
        { id: "cfr_silva", programId: program.id, userId: "usr_silva_owner", role: "farm_owner" },
        { id: "cfr_bagro", programId: program.id, userId: "usr_bagro_admin", role: "bagro_office" },
        { id: "cfr_field", programId: program.id, userId: lead.id, role: "field_supervisor" },
        { id: "cfr_admin", programId: program.id, userId: "usr_spx_admin", role: "spx_platform_admin" },
      ],
      skipDuplicates: true,
    });
  } catch (e) {
    console.warn("Cropfort roles seed skipped:", e.message);
  }

  // Silva-ordered Tier 2 harvest project for September — pending SPX planning / approval / work plan
  try {
    const chaka = await prisma.farm_estates.findFirst({
      where: { programId: program.id, name: { contains: "Chaka", mode: "insensitive" }, status: "active" },
      select: { id: true },
    });
    const harvestActivityIds = (
      await prisma.activity_master.findMany({
        where: {
          programId: program.id,
          id: { in: ["act_t2_001", "act_t2_002", "act_t2_003", "act_t2_005", "act_t2_007"] },
        },
        select: { id: true },
      })
    ).map((a) => a.id);
    const harvestBlocks = chaka
      ? await prisma.farm_blocks.findMany({
          where: { farmEstateId: chaka.id, code: { in: ["BLK-001", "BLK-002", "BLK-003", "BLK-004", "BLK-005"] } },
          select: { id: true, code: true },
          orderBy: { code: "asc" },
        })
      : [];

    await prisma.activity_requests.upsert({
      where: { id: "ahr_harvest_sep_2026" },
      create: {
        id: "ahr_harvest_sep_2026",
        programId: program.id,
        farmEstateId: chaka?.id || null,
        requestType: "other",
        operationKind: "project",
        title: "September Harvest Session — Chaka Buna",
        description:
          "Discipline: Harvest Operations\n\nSilva-ordered Tier 2 harvest session for September peak. " +
          "Elected Annual Harvest Management activities. Pending SPX planning, approval, and work-plan assignment to B-Agro.",
        urgency: "normal",
        blocksOrAreas: harvestBlocks.map((b) => b.code).join(", ") || "Chaka Buna",
        blockIds: harvestBlocks.map((b) => b.id),
        activityIds: harvestActivityIds,
        plannedStartDate: new Date("2026-09-01T00:00:00.000Z"),
        plannedEndDate: new Date("2026-10-31T00:00:00.000Z"),
        estimatedAmountEtb: 850000,
        status: "submitted",
        origin: "silva_request",
        requestedByUserId: "usr_silva_owner",
        suggestedAfpLineId: "AFP-2026-003",
      },
      update: {
        farmEstateId: chaka?.id || null,
        title: "September Harvest Session — Chaka Buna",
        status: "submitted",
        operationKind: "project",
        plannedStartDate: new Date("2026-09-01T00:00:00.000Z"),
        plannedEndDate: new Date("2026-10-31T00:00:00.000Z"),
        blockIds: harvestBlocks.map((b) => b.id),
        activityIds: harvestActivityIds,
        estimatedAmountEtb: 850000,
        convertedAfeId: null,
        convertedCropfortAfeId: null,
        workPlanSubmissionId: null,
        dismissedAt: null,
      },
    });

    await prisma.notifications.create({
      data: {
        id: "ntf_harvest_sep_2026",
        programId: program.id,
        triggerType: "adhoc_submitted",
        entityType: "ad_hoc_request",
        entityId: "ahr_harvest_sep_2026",
        recipientRole: "spx_principal",
        recipientUserId: principal.id,
        message:
          "Silva ordered September Harvest Session (Chaka Buna) — plan, approve, then assign work plan.",
      },
    });
    console.log("Seeded September harvest project request: ahr_harvest_sep_2026");

    // Tier 3 interventions — materials + facility (replaces ad-hoc irrigation demo)
    const materialActs = (
      await prisma.activity_master.findMany({
        where: { id: { in: ["act_t3_005"] } },
        select: { id: true },
      })
    ).map((a) => a.id);
    const facilityActs = (
      await prisma.activity_master.findMany({
        where: { id: { in: ["act_t3_002", "act_t3_016"] } },
        select: { id: true },
      })
    ).map((a) => a.id);
    const interventionBlocks = harvestBlocks.slice(0, 3);

    await prisma.activity_requests.upsert({
      where: { id: "ahr_materials_procurement" },
      create: {
        id: "ahr_materials_procurement",
        programId: program.id,
        farmEstateId: chaka?.id || null,
        requestType: "urgent_field_work",
        operationKind: "intervention",
        title: "Urgent harvest materials procurement — Chaka Buna",
        description:
          "Discipline: Infrastructure\n\nUrgent procurement of picking bags, drying-bed materials, tarpaulins, and " +
          "harvest tools ahead of peak season. Outside the annual plan envelope — requires SPX conversion to AFE.",
        urgency: "high",
        blocksOrAreas: interventionBlocks.map((b) => b.code).join(", ") || "Chaka Buna",
        blockIds: interventionBlocks.map((b) => b.id),
        activityIds: materialActs,
        estimatedAmountEtb: 275000,
        status: "submitted",
        origin: "silva_request",
        requestedByUserId: "usr_silva_owner",
      },
      update: {
        title: "Urgent harvest materials procurement — Chaka Buna",
        status: "submitted",
        operationKind: "intervention",
        activityIds: materialActs,
        blockIds: interventionBlocks.map((b) => b.id),
        estimatedAmountEtb: 275000,
        farmEstateId: chaka?.id || null,
      },
    });

    await prisma.activity_requests.upsert({
      where: { id: "ahr_facility_build" },
      create: {
        id: "ahr_facility_build",
        programId: program.id,
        farmEstateId: chaka?.id || null,
        requestType: "infrastructure_inspection",
        operationKind: "intervention",
        title: "Drying shed / storage facility build — Chaka Buna",
        description:
          "Discipline: Infrastructure\n\nOwner-requested drying shed and short-term cherry storage near BLK-001–003. " +
          "Technical due diligence and feasibility required before AFE and contractor mobilisation.",
        urgency: "normal",
        blocksOrAreas: interventionBlocks.map((b) => b.code).join(", ") || "Chaka Buna",
        blockIds: interventionBlocks.map((b) => b.id),
        activityIds: facilityActs,
        estimatedAmountEtb: 1850000,
        status: "submitted",
        origin: "silva_request",
        requestedByUserId: "usr_silva_owner",
      },
      update: {
        title: "Drying shed / storage facility build — Chaka Buna",
        status: "submitted",
        operationKind: "intervention",
        activityIds: facilityActs,
        blockIds: interventionBlocks.map((b) => b.id),
        estimatedAmountEtb: 1850000,
        farmEstateId: chaka?.id || null,
      },
    });
    console.log("Seeded intervention requests: materials + facility build");
  } catch (e) {
    console.warn("Harvest project seed skipped:", e.message);
  }

  try {
    const { seedCropfortDemo } = require("./seed/cropfortDemo");
    const demo = await seedCropfortDemo(prisma, {
      programId: program.id,
      principalId: principal.id,
      silvaOwnerId: "usr_silva_owner",
      bagroLeadId: lead.id,
    });
    console.log("Cropfort demo fixtures:", demo.counts, `(week ${demo.weekEnding})`);
  } catch (e) {
    console.warn("Cropfort demo seed skipped:", e.message);
  }

  console.log("Seed complete. Program:", PROGRAM_ID, "Password: Password123!");
  console.log("Cropfort demo verify: npm run verify:cropfort-demo (server must be running)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
