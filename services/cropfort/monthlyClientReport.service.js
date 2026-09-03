const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { requireProgramId } = require("../utils/programScope");

const ASSURANCE_NOTE =
  "This report reflects the field manager's own reporting on its work and is not independent proof. " +
  "Independent assurance may be obtained through: (1) audit-trail drill-down to underlying activity, " +
  "expenditure, work-order, and field-ticket records on request; (2) externally verifiable facts such as " +
  "yield vs baseline, export volumes, and certification audits; (3) the farm owner's own oversight channel, " +
  "which sits outside this platform's reporting pipeline.";

exports.getOrCreate = async (user, farmEstateId, reportMonth) => {
  const programId = requireProgramId(user);
  const month = new Date(reportMonth);
  month.setUTCDate(1);
  const row = await prisma.monthly_client_reports.upsert({
    where: { farmEstateId_reportMonth: { farmEstateId, reportMonth: month } },
    create: {
      id: uuid("mcr"),
      programId,
      farmEstateId,
      reportMonth: month,
      createdByUserId: user.id,
    },
    update: {},
  });
  return exports.buildReport(row.id, user);
};

exports.updateNarrative = async (user, reportId, dto) => {
  const row = await prisma.monthly_client_reports.update({
    where: { id: reportId, status: { not: "sent" } },
    data: {
      fieldObservations: dto.fieldObservations ?? undefined,
      lookAheadNotes: dto.lookAheadNotes ?? undefined,
    },
  });
  return exports.buildReport(row.id, user);
};

exports.send = async (user, reportId) => {
  const row = await prisma.monthly_client_reports.update({
    where: { id: reportId, status: { not: "sent" } },
    data: { status: "sent", sentAt: new Date() },
  });
  return exports.buildReport(row.id, user);
};

exports.buildReport = async (reportId, user) => {
  const report = await prisma.monthly_client_reports.findUnique({
    where: { id: reportId },
    include: { farmEstate: true },
  });
  if (!report) throw new AppError(404, "NOT_FOUND", "Report not found.");
  const stallRows = await prisma.supervisor_progress.findMany({
    where: {
      programId: report.programId,
      activityPlan: { farmEstateId: report.farmEstateId },
      pctComplete: { not: "pct_100" },
    },
    include: { activityPlan: { include: { activity: true, block: true } } },
  });
  const atRisk = stallRows.filter((sp) => {
    if (!sp.lastMovementDate) return false;
    const weeks =
      (Date.now() - new Date(sp.lastMovementDate).getTime()) / (7 * 24 * 60 * 60 * 1000);
    return weeks >= 2;
  });
  return {
    id: report.id,
    farmEstateId: report.farmEstateId,
    farmName: report.farmEstate.name,
    reportMonth: report.reportMonth.toISOString().slice(0, 10),
    status: report.status,
    sentAt: report.sentAt?.toISOString() || null,
    fieldObservations: report.fieldObservations,
    lookAheadNotes: report.lookAheadNotes,
    assuranceNote: ASSURANCE_NOTE,
    riskRegister: atRisk.map((sp) => ({
      activityCode: sp.activityPlan.activity?.code,
      blockCode: sp.activityPlan.block?.code,
      pctComplete: sp.pctComplete,
      lastMovementDate: sp.lastMovementDate?.toISOString().slice(0, 10) || null,
    })),
  };
};

exports.ASSURANCE_NOTE = ASSURANCE_NOTE;
