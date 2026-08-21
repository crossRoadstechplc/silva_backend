const prisma = require("../config/database");
const { createNotification } = require("./queues");

function utilizationHealth(percent) {
  if (percent > 100) return "over_budget";
  if (percent >= 85) return "watch";
  return "on_track";
}

async function runForProgram(programId) {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000);
  const pending = await prisma.afes.findMany({
    where: { programId, silvaApprovalRequired: true, status: "validated", updatedAt: { lte: fiveDaysAgo } },
  });
  for (const afe of pending) {
    await createNotification({
      programId,
      triggerType: "afe_pending",
      entityType: "afe",
      entityId: afe.id,
      recipientRole: "silva_owner",
      message: `${afe.id} has been pending Silva approval for more than 5 days.`,
    });
  }

  const bandB = await prisma.afes.findMany({
    where: { programId, band: "B", status: { in: ["approved", "active"] }, approvalDate: { gte: fiveDaysAgo } },
  });
  for (const afe of bandB) {
    await createNotification({
      programId,
      triggerType: "afe_pending",
      entityType: "afe",
      entityId: afe.id,
      recipientRole: "silva_owner",
      message: `${afe.id} (Band B) was issued by SPX — Silva may object within 5 business days.`,
    });
  }

  const year = new Date().getUTCFullYear();
  const cfg = await prisma.platform_config.findUnique({ where: { programId } });
  const fx = cfg ? Number(cfg.fxRateEtbPerUsd) : 57.2;
  const lines = await prisma.afp_lines.findMany({ where: { programId, year } });
  for (const line of lines) {
    const afes = await prisma.afes.findMany({ where: { afpLineId: line.id, status: { notIn: ["rejected"] } } });
    const wos = await prisma.work_orders.findMany({ where: { afeId: { in: afes.map((a) => a.id) } } });
    const settlements = await prisma.owner_settlements.findMany({
      where: { workOrderId: { in: wos.map((w) => w.id) }, status: "settled" },
    });
    const actualUsd = settlements.reduce((s, st) => s + Number(st.amountEtb) / fx, 0);
    const percent = Number(line.budgetAllocatedUsd)
      ? Math.round((actualUsd / Number(line.budgetAllocatedUsd)) * 100)
      : 0;
    const health = utilizationHealth(percent);
    if (health === "watch" || health === "over_budget") {
      await createNotification({
        programId,
        triggerType: health === "watch" ? "budget_watch" : "budget_over",
        entityType: "afp_line",
        entityId: line.id,
        recipientRole: "spx_principal",
        message: `${line.id} utilization is ${percent}% (${health}).`,
      });
    }
  }
}

async function runNotificationSweep() {
  const soon = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const expiring = await prisma.vendors.findMany({
    where: { insuranceExpiry: { lte: soon, gte: new Date() } },
  });
  for (const vendor of expiring) {
    await createNotification({
      triggerType: "insurance_expiring",
      entityType: "vendor",
      entityId: vendor.id,
      recipientRole: "spx_account_handler",
      message: `Insurance for ${vendor.name} expires on ${vendor.insuranceExpiry.toISOString().slice(0, 10)}.`,
    });
  }

  const programs = await prisma.programs.findMany({ where: { status: "active" } });
  for (const p of programs) await runForProgram(p.id);
}

if (require.main === module) {
  runNotificationSweep()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runNotificationSweep, runForProgram };
