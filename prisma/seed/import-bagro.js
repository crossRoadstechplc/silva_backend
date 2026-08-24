/**
 * B-Agro planning layer seed: 12 AFP lines, 36 AFEs, 62 activity catalog rows,
 * 62 work order templates, and quarterly activity schedules.
 */

const AFP_LINES = [
  { id: "AFP-2026-001", discipline: "Agronomic Operations", activity: "Nursery program — 60,000 seedlings", budget: 456, kpi: "Seedling survival ≥85%" },
  { id: "AFP-2026-002", discipline: "Agronomic Operations", activity: "Young coffee care — Blocks A–G", budget: 2980, kpi: "Cover crop compliance 100%" },
  { id: "AFP-2026-003", discipline: "Agronomic Operations", activity: "Mature coffee maintenance — 129 ha", budget: 7669, kpi: "Pruning completion per schedule" },
  { id: "AFP-2026-004", discipline: "Agronomic Operations", activity: "Infilling program — 48,000 trees", budget: 2092, kpi: "Infilling survival ≥80%" },
  { id: "AFP-2026-005", discipline: "Harvest & Post-Harvest", activity: "Harvest campaign — cherry to hulling", budget: 18185, kpi: "Yield ≥350 kg/ha green bean" },
  { id: "AFP-2026-006", discipline: "Procurement & Supply Chain", activity: "Agronomic inputs", budget: 3973, kpi: "Input application per protocol" },
  { id: "AFP-2026-007", discipline: "Harvest & Post-Harvest", activity: "Harvest supplies", budget: 1538, kpi: "Drying bed readiness pre-harvest" },
  { id: "AFP-2026-008", discipline: "Infrastructure & Capital Works", activity: "Site construction", budget: 2262, kpi: "Completion by Q2" },
  { id: "AFP-2026-009", discipline: "Admin & Compliance", activity: "Office equipment", budget: 215, kpi: "Operational by Q1" },
  { id: "AFP-2026-010", discipline: "Labor & Payroll", activity: "Farm staff payroll — Silva EOR", budget: 20079, kpi: "Payroll accuracy 100%" },
  { id: "AFP-2026-011", discipline: "Digital Farm Operations", activity: "Coffee Field OS deployment", budget: 22000, kpi: "Platform live by Q2" },
  { id: "AFP-2026-012", discipline: "Infrastructure & Capital Works", activity: "Block reclassification & GIS", budget: 15000, kpi: "20-block structure mapped" },
];

const PAYROLL_LINES = [
  { code: "PAY-01", activity: "Permanent salary", annualEtb: 1378177, monthlyEtb: 114848 },
  { code: "PAY-02", activity: "Contractual salary", annualEtb: 549953, monthlyEtb: 45829 },
  { code: "PAY-03", activity: "Pension (11%)", annualEtb: 175224, monthlyEtb: 14602 },
  { code: "PAY-04", activity: "Petty cash", annualEtb: 12240, monthlyEtb: 1020 },
  { code: "PAY-05", activity: "Per diem", annualEtb: 72000, monthlyEtb: 6000 },
  { code: "PAY-06", activity: "Mobile card & photocopy", annualEtb: 19800, monthlyEtb: 1650 },
  { code: "PAY-07", activity: "Fuel & lubricant", annualEtb: 84000, monthlyEtb: 7000 },
  { code: "PAY-08", activity: "Medical expense", annualEtb: 78000, monthlyEtb: 6500 },
  { code: "PAY-09", activity: "Bonus (one month)", annualEtb: 146020, monthlyEtb: null },
  { code: "PAY-10", activity: "Land use tax", annualEtb: 64875, monthlyEtb: null },
];

const SECTIONS = [
  { prefix: "NUR", count: 16, section: "I Nursery", afpLineId: "AFP-2026-001", unit: "unit", baseMd: 0.04, wage: 450, baseQty: 3750 },
  { prefix: "YNG", count: 6, section: "II Young Coffee", afpLineId: "AFP-2026-002", unit: "ha", baseMd: 0.8, wage: 480, baseQty: 45 },
  { prefix: "MAT", count: 7, section: "III Matured Coffee", afpLineId: "AFP-2026-003", unit: "tree", baseMd: 0.012, wage: 500, baseQty: 22465 },
  { prefix: "INF", count: 6, section: "IV Infilling", afpLineId: "AFP-2026-004", unit: "tree", baseMd: 0.025, wage: 470, baseQty: 8000 },
  { prefix: "HRV", count: 16, section: "V & VI Harvest", afpLineId: "AFP-2026-005", unit: "kg", baseMd: 0.002, wage: 520, baseQty: 15000 },
  { prefix: "MAT-S", count: 4, section: "Materials", afpLineId: "AFP-2026-006", unit: "lot", baseMd: 0.5, wage: 500, baseQty: 12 },
  { prefix: "CON", count: 1, section: "Construction", afpLineId: "AFP-2026-008", unit: "project", baseMd: 120, wage: 550, baseQty: 1 },
  { prefix: "ADM", count: 1, section: "Office", afpLineId: "AFP-2026-009", unit: "lot", baseMd: 8, wage: 500, baseQty: 1 },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function buildActivities() {
  const items = [];
  for (const sec of SECTIONS) {
    for (let i = 1; i <= sec.count; i++) {
      const code =
        sec.prefix === "MAT-S"
          ? `MAT-S${pad2(i)}`
          : sec.prefix === "CON"
            ? "CON-01"
            : sec.prefix === "ADM"
              ? "ADM-01"
              : `${sec.prefix}-${pad2(i)}`;
      const md = sec.baseMd * (1 + (i % 5) * 0.05);
      const qty = sec.baseQty * (1 + (i % 3) * 0.1);
      const mdTotal = qty * md;
      items.push({
        id: `act_${code.toLowerCase().replace(/-/g, "_")}`,
        code,
        section: sec.section,
        afpLineId: sec.afpLineId,
        activity: `${sec.section} — ${code} field activity`,
        unit: sec.unit,
        mdPerUnit: md,
        wageEtb: sec.wage,
        costPerUnitEtb: md * sec.wage,
        annualQty: qty,
        annualMd: mdTotal,
        annualCostEtb: mdTotal * sec.wage,
        peakQuarter: i % 4 === 0 ? "Q4" : i % 3 === 0 ? "Q3" : i % 2 === 0 ? "Q2" : "Q1",
        isPayroll: false,
      });
    }
  }
  for (const pay of PAYROLL_LINES) {
    items.push({
      id: `act_${pay.code.toLowerCase().replace(/-/g, "_")}`,
      code: pay.code,
      section: "Salary & Admin",
      afpLineId: "AFP-2026-010",
      activity: pay.activity,
      unit: "month",
      mdPerUnit: 0,
      wageEtb: pay.monthlyEtb ?? pay.annualEtb,
      costPerUnitEtb: pay.monthlyEtb ?? pay.annualEtb,
      annualQty: pay.monthlyEtb ? 12 : 1,
      annualMd: 0,
      annualCostEtb: pay.annualEtb,
      peakQuarter: pay.code === "PAY-09" ? "Q3" : pay.code === "PAY-10" ? "Q1" : null,
      isPayroll: true,
    });
  }
  return items;
}

function afeForActivity(act) {
  if (act.afpLineId === "AFP-2026-010") return `AFE-${String(24 + (parseInt(act.code.split("-")[1], 10) - 1)).padStart(4, "0")}`;
  if (act.afpLineId === "AFP-2026-005" && act.code.startsWith("HRV-0")) return "AFE-0011";
  if (act.afpLineId === "AFP-2026-011") return "AFE-0022";
  if (act.afpLineId === "AFP-2026-012") return "AFE-0023";
  const map = {
    "AFP-2026-001": "AFE-0001",
    "AFP-2026-002": "AFE-0002",
    "AFP-2026-003": "AFE-0003",
    "AFP-2026-004": "AFE-0004",
    "AFP-2026-005": "AFE-0005",
    "AFP-2026-006": "AFE-0009",
    "AFP-2026-007": "AFE-0010",
    "AFP-2026-008": "AFE-0012",
    "AFP-2026-009": "AFE-0013",
  };
  return map[act.afpLineId] || "AFE-0001";
}

async function seedBagroPlanningLayer(prisma, ctx) {
  const { programId, principalId, handlerId } = ctx;
  const activities = buildActivities();

  await prisma.activity_schedule.deleteMany({ where: { programId } });
  await prisma.work_order_templates.deleteMany({ where: { programId } });
  await prisma.activity_catalog.deleteMany({ where: { programId } });

  await prisma.activity_catalog.createMany({
    data: activities.map((a) => ({
      ...a,
      programId,
    })),
  });

  const schedules = [];
  for (const act of activities.filter((a) => !a.isPayroll && a.annualQty)) {
    for (let q = 1; q <= 4; q++) {
      schedules.push({
        id: `as_${act.code.toLowerCase()}_q${q}`,
        programId,
        activityCatalogId: act.id,
        activityCode: act.code,
        year: 2026,
        quarter: `Q${q}`,
        plannedQty: Number(act.annualQty) / 4,
      });
    }
  }
  if (schedules.length) {
    await prisma.activity_schedule.createMany({ data: schedules });
  }

  const templates = activities.map((act, idx) => {
    const tplNum = idx + 1;
    const plannedMd = act.isPayroll ? 0 : Number(act.annualMd) / 4;
    return {
      id: `WOT-${String(tplNum).padStart(4, "0")}`,
      programId,
      afeId: afeForActivity(act),
      activityCatalogId: act.id,
      activityCode: act.code,
      activityName:
        act.code === "NUR-05"
          ? "Filling polytubes — 60,000 units"
          : act.code === "MAT-03"
            ? "Pruning — 157,260 trees"
            : act.code === "HRV-05"
              ? "Cherry picking — Q1"
              : act.code.startsWith("PAY-")
                ? `Monthly payroll — ${act.activity}`
                : `${act.activity} (${act.code})`,
      blocks: act.section.includes("Harvest") ? "All blocks" : "B1–B12",
      tier: act.isPayroll || act.afpLineId === "AFP-2026-011" ? "retainer" : idx % 3 === 0 ? "project" : "retainer",
      plannedQty: act.isPayroll ? 1 : Number(act.annualQty) / 4,
      plannedMd,
      plannedCostEtb: act.isPayroll ? act.costPerUnitEtb : plannedMd * act.wageEtb,
      normMdPerUnit: act.mdPerUnit,
      normWageEtb: act.wageEtb,
      validationTolerancePct: 10,
      weekStart: 1 + (idx % 12) * 4,
      weekEnd: 4 + (idx % 12) * 4,
      issueWindowLabel: act.peakQuarter || "Year-round",
      status: "active",
    };
  });

  await prisma.work_order_templates.createMany({ data: templates });

  return { activityCount: activities.length, templateCount: templates.length, scheduleCount: schedules.length };
}

async function seedBagroAfpAfes(prisma, ctx) {
  const { programId, principalId, handlerId } = ctx;

  const afpRecords = AFP_LINES.map((line) => ({
    id: line.id,
    programId,
    year: 2026,
    operatingDiscipline: line.discipline,
    activity: line.activity,
    budgetAllocatedUsd: line.budget,
    kpiTarget: line.kpi,
    status: "approved",
    silvaApproved: true,
    approvalDate: new Date("2026-01-05T00:00:00.000Z"),
    notes: "B-Agro mapped AFP line",
    createdByUserId: principalId,
  }));

  await prisma.afp_lines.createMany({ data: afpRecords, skipDuplicates: true });

  const afes = [
    { id: "AFE-0001", afpLineId: "AFP-2026-001", description: "Nursery Q3–Q4", cost: 456, band: "A", silva: false, status: "approved" },
    { id: "AFE-0002", afpLineId: "AFP-2026-002", description: "Young coffee Blocks A–G", cost: 2980, band: "A", silva: false, status: "approved" },
    { id: "AFE-0003", afpLineId: "AFP-2026-003", description: "Mature coffee maintenance", cost: 7669, band: "A", silva: false, status: "approved" },
    { id: "AFE-0004", afpLineId: "AFP-2026-004", description: "Infilling program", cost: 2092, band: "A", silva: false, status: "approved" },
    { id: "AFE-0005", afpLineId: "AFP-2026-005", description: "Harvest Q4 picking", cost: 4546, band: "A", silva: false, status: "approved" },
    { id: "AFE-0006", afpLineId: "AFP-2026-005", description: "Harvest processing", cost: 4546, band: "A", silva: false, status: "approved" },
    { id: "AFE-0007", afpLineId: "AFP-2026-005", description: "Harvest Q2 picking", cost: 4546, band: "A", silva: false, status: "approved" },
    { id: "AFE-0008", afpLineId: "AFP-2026-005", description: "Harvest Q3 picking", cost: 4547, band: "A", silva: false, status: "approved" },
    { id: "AFE-0009", afpLineId: "AFP-2026-006", description: "Agronomic inputs procurement", cost: 3973, band: "A", silva: false, status: "approved" },
    { id: "AFE-0010", afpLineId: "AFP-2026-007", description: "Harvest supplies", cost: 1538, band: "A", silva: false, status: "approved" },
    { id: "AFE-0011", afpLineId: "AFP-2026-005", description: "Harvest Q1 picking", cost: 10665, band: "B", silva: false, status: "approved" },
    { id: "AFE-0012", afpLineId: "AFP-2026-008", description: "Site construction", cost: 2262, band: "A", silva: false, status: "approved" },
    { id: "AFE-0013", afpLineId: "AFP-2026-009", description: "Office equipment", cost: 215, band: "A", silva: false, status: "approved" },
    { id: "AFE-0022", afpLineId: "AFP-2026-011", description: "Coffee Field OS platform", cost: 22000, band: "C", silva: true, status: "validated" },
    { id: "AFE-0023", afpLineId: "AFP-2026-012", description: "GIS block reclassification", cost: 55000, band: "D", silva: true, status: "validated" },
  ];

  const months = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"];
  for (let i = 0; i < 12; i++) {
    afes.push({
      id: `AFE-${String(24 + i).padStart(4, "0")}`,
      afpLineId: "AFP-2026-010",
      description: `Monthly payroll — ${months[i]} 2026`,
      cost: i === 8 ? 2658 : 1534,
      band: "A",
      silva: false,
      status: "approved",
    });
  }

  await prisma.afes.createMany({
    data: afes.map((a) => ({
      id: a.id,
      programId,
      afpLineId: a.afpLineId,
      operatingDiscipline: AFP_LINES.find((l) => l.id === a.afpLineId)?.discipline || "Labor & Payroll",
      description: a.description,
      estimatedCostUsd: a.cost,
      band: a.band,
      spxValidated: true,
      silvaApprovalRequired: a.silva,
      silvaApproved: a.silva ? null : false,
      approvalDate: a.status === "approved" ? new Date("2026-01-15T00:00:00.000Z") : null,
      status: a.status,
      createdByUserId: handlerId,
    })),
    skipDuplicates: true,
  });

  return { afpCount: AFP_LINES.length, afeCount: afes.length };
}

module.exports = { seedBagroPlanningLayer, seedBagroAfpAfes, buildActivities };
