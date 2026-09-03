const prisma = require("../../config/database");
const AppError = require("../../utils/AppError");
const { uuid } = require("../../utils/ids");
const { requireProgramId } = require("../utils/programScope");
const { activityTierFromCode } = require("../../lib/cropfortCategoryWindows");

function buildMonthlyRollup(feeSchedule, termStart) {
  const months = [];
  const base = termStart ? new Date(termStart) : new Date();
  const confirmedMonthly = Number(feeSchedule.confirmedAnnualFee || 0) / 12;

  for (let m = 0; m < 36; m++) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + m);
    const monthIndex = m + 1;
    let electiveFee = 0;

    for (const line of feeSchedule.lines || []) {
      if (line.deferred || line.annualFee == null) continue;
      // An elective line recurs every month once activated, not only in its
      // activation month.
      if (monthIndex >= (line.activationMonth ?? 1)) {
        electiveFee += Number(line.annualFee) / 12;
      }
    }

    months.push({
      monthIndex,
      monthLabel: d.toISOString().slice(0, 7),
      confirmedFeeEtb: Number(confirmedMonthly.toFixed(2)),
      electiveFeeEtb: Number(electiveFee.toFixed(2)),
      feeEtb: Number((confirmedMonthly + electiveFee).toFixed(2)),
    });
  }
  let cumulative = 0;
  return months.map((row) => {
    cumulative += row.feeEtb;
    return { ...row, cumulativeFeeEtb: Number(cumulative.toFixed(2)) };
  });
}

exports.buildMonthlyRollup = buildMonthlyRollup;

exports.get = async (user, farmEstateId) => {
  const programId = requireProgramId(user);
  const row = await prisma.fee_schedules.findFirst({
    where: { farmEstateId, programId },
    orderBy: { version: "desc" },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row) return null;
  const farm = await prisma.farm_estates.findUnique({ where: { id: farmEstateId } });
  return {
    id: row.id,
    farmEstateId,
    confirmedAnnualFee: Number(row.confirmedAnnualFee),
    status: row.status,
    version: row.version,
    lines: row.lines.map((l) => ({
      id: l.id,
      label: l.label,
      annualFee: l.annualFee != null ? Number(l.annualFee) : null,
      activationMonth: l.activationMonth,
      deferred: l.deferred,
    })),
    monthlyRollup: buildMonthlyRollup(row, farm?.termStartDate),
  };
};

exports.upsert = async (user, farmEstateId, dto) => {
  const programId = requireProgramId(user);
  const existing = await prisma.fee_schedules.findFirst({
    where: { farmEstateId, status: "draft" },
    orderBy: { version: "desc" },
  });
  let schedule;
  if (existing) {
    schedule = await prisma.fee_schedules.update({
      where: { id: existing.id },
      data: { confirmedAnnualFee: dto.confirmedAnnualFee },
    });
    if (dto.lines) {
      await prisma.fee_schedule_lines.deleteMany({ where: { feeScheduleId: schedule.id } });
      await prisma.fee_schedule_lines.createMany({
        data: dto.lines.map((l, i) => ({
          id: uuid("fsl"),
          feeScheduleId: schedule.id,
          label: l.label,
          annualFee: l.annualFee ?? null,
          activationMonth: l.activationMonth ?? null,
          deferred: Boolean(l.deferred),
          sortOrder: i,
        })),
      });
    }
  } else {
    schedule = await prisma.fee_schedules.create({
      data: {
        id: uuid("fsc"),
        programId,
        farmEstateId,
        confirmedAnnualFee: dto.confirmedAnnualFee,
        createdByUserId: user.id,
        lines: dto.lines?.length
          ? {
              create: dto.lines.map((l, i) => ({
                id: uuid("fsl"),
                label: l.label,
                annualFee: l.annualFee ?? null,
                activationMonth: l.activationMonth ?? null,
                deferred: Boolean(l.deferred),
                sortOrder: i,
              })),
            }
          : undefined,
      },
    });
  }
  return exports.get(user, farmEstateId);
};

exports.submit = async (user, farmEstateId) => {
  const row = await prisma.fee_schedules.findFirst({
    where: { farmEstateId, status: "draft" },
    orderBy: { version: "desc" },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Draft fee schedule not found.");
  await prisma.fee_schedules.update({
    where: { id: row.id },
    data: { status: "submitted", submittedAt: new Date() },
  });
  return exports.get(user, farmEstateId);
};

exports.approve = async (user, farmEstateId) => {
  const farm = await prisma.farm_estates.findUnique({ where: { id: farmEstateId } });
  if (farm?.approverUserId && farm.approverUserId !== user.id) {
    throw new AppError(403, "FORBIDDEN", "Only farm approver may approve fee schedule.");
  }
  const row = await prisma.fee_schedules.findFirst({
    where: { farmEstateId, status: "submitted" },
    orderBy: { version: "desc" },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Submitted fee schedule not found.");
  await prisma.fee_schedules.update({
    where: { id: row.id },
    data: { status: "approved", approvedAt: new Date() },
  });
  return exports.get(user, farmEstateId);
};
