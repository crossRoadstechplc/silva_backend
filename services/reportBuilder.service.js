const prisma = require("../config/database");
const { scopedWhere, requireProgramId } = require("./utils/programScope");

async function buildMonitoringSummary(programId, year) {
  const forms = await prisma.ifs_forms.findMany({
    where: {
      programId,
      status: "validated",
      createdAt: {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
      },
    },
  });
  const byType = {};
  for (const f of forms) {
    byType[f.formType] = (byType[f.formType] || 0) + 1;
  }
  const dailyLogs = forms.filter((f) => f.formType === "daily_work_log");
  const laborDays = dailyLogs.reduce((sum, f) => sum + Number(f.payload?.hoursWorked || 0), 0);
  return {
    validatedFormCount: forms.length,
    formsByType: byType,
    laborHoursLogged: laborDays,
    blocksReferenced: [...new Set(forms.map((f) => f.blockRef).filter(Boolean))],
  };
}

async function snapshotSelectedFieldLogs(programId) {
  const rows = await prisma.ifs_forms.findMany({
    where: { programId, includeInSilvaReport: true, status: "validated" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map((row) => ({
    id: row.id,
    formType: row.formType,
    title: row.title,
    blockRef: row.blockRef,
    weekNumber: row.weekNumber,
    payload: row.payload || {},
    createdAt: row.createdAt.toISOString(),
  }));
}

async function ownerRequestedActivities(programId, year) {
  const rows = await prisma.activity_requests.findMany({
    where: {
      programId,
      origin: "silva_request",
      status: "converted",
      updatedAt: {
        gte: new Date(`${year}-01-01T00:00:00.000Z`),
        lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
      },
    },
    include: { convertedAfe: { select: { id: true, status: true, description: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    requestType: r.requestType,
    title: r.title,
    description: r.description,
    convertedAfeId: r.convertedAfe?.id || null,
    afeStatus: r.convertedAfe?.status || null,
  }));
}

exports.buildReleaseSections = async (user, year) => {
  const programId = requireProgramId(user);
  const y = Number(year) || new Date().getUTCFullYear();
  const [monitoring_summary, selected_field_logs, owner_requested_activities] = await Promise.all([
    buildMonitoringSummary(programId, y),
    snapshotSelectedFieldLogs(programId),
    ownerRequestedActivities(programId, y),
  ]);
  return { monitoring_summary, selected_field_logs, owner_requested_activities };
};

exports.listCuratableLogs = async (user) => {
  const where = scopedWhere(user, { status: "validated" });
  const rows = await prisma.ifs_forms.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    formType: row.formType,
    title: row.title,
    blockRef: row.blockRef,
    includeInSilvaReport: row.includeInSilvaReport,
    createdAt: row.createdAt.toISOString(),
  }));
};
