const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PASSWORD = "Password123!";
const PROGRAM_ID = "prg_shecha";

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  await prisma.audit_log.deleteMany();
  await prisma.notifications.deleteMany();
  await prisma.attachments.deleteMany();
  await prisma.gl_journal_export_lines.deleteMany();
  await prisma.gl_journal_exports.deleteMany();
  await prisma.reports.deleteMany();
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
  const highlandOrg = await prisma.organizations.create({
    data: {
      id: "org_highland",
      name: "Highland Harvest Ltd",
      slug: "highland-harvest",
      displayName: "Highland Harvest",
      type: "vendor",
    },
  });

  const program = await prisma.programs.create({
    data: {
      id: PROGRAM_ID,
      name: "Shecha Estate",
      slug: "shecha-estate",
      createdByOrgId: spx.id,
      brandingJson: { tagline: "Kaffa Zone turnaround" },
    },
  });

  await prisma.program_memberships.createMany({
    data: [
      { id: "pm_silva", programId: program.id, organizationId: silva.id, roleInProgram: "owner" },
      { id: "pm_spx", programId: program.id, organizationId: spx.id, roleInProgram: "manager" },
      { id: "pm_bagro", programId: program.id, organizationId: bagroOrg.id, roleInProgram: "executor" },
      { id: "pm_highland", programId: program.id, organizationId: highlandOrg.id, roleInProgram: "viewer" },
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
  await prisma.vendors.create({
    data: {
      id: "vnd_highland",
      organizationId: highlandOrg.id,
      name: "Highland Harvest Ltd",
      category: "Harvest & Post-Harvest",
      servicesProvided: "Selective picking supervision",
      status: "pending",
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
  await user("usr_highland_admin", "Highland Admin", "admin@highland.example", "vendor_admin", highlandOrg.id, "vnd_highland");

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

  console.log("Seed complete. Program:", PROGRAM_ID, "Password: Password123!");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
