const prisma = require("../config/database");
const { createNotification } = require("./queues");

function utilizationHealth(percent) {
  if (percent > 100) return "over_budget";
  if (percent >= 85) return "watch";
  return "on_track";
}

function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

async function notifySilvaRoles(payload) {
  for (const role of ["silva_owner", "silva_country_manager"]) {
    await createNotification({ ...payload, recipientRole: role });
  }
}

async function runForProgram(programId) {
  const now = new Date();
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000);

  const pending = await prisma.afes.findMany({
    where: { programId, silvaApprovalRequired: true, status: "validated", updatedAt: { lte: fiveDaysAgo } },
  });
  for (const afe of pending) {
    const overdueDays = daysBetween(new Date(afe.updatedAt), now);
    await notifySilvaRoles({
      programId,
      triggerType: "afe_pending",
      entityType: "afe",
      entityId: afe.id,
      message: `${afe.id} (Band ${afe.band}) has been pending Silva approval for ${overdueDays} days.`,
    });
  }

  // Band B objection window: opened within last 5 days
  const bandBOpen = await prisma.afes.findMany({
    where: {
      programId,
      band: "B",
      status: { in: ["approved", "active"] },
      approvalDate: { gte: fiveDaysAgo },
    },
  });
  for (const afe of bandBOpen) {
    const daysOpen = daysBetween(new Date(afe.approvalDate), now);
    const daysLeft = Math.max(0, 5 - daysOpen);
    let triggerType = "bandb_objection_window_opened";
    let message = `${afe.id} (Band B) issued by SPX — Silva may object within 5 business days (silence is deemed approval).`;
    if (daysLeft <= 2 && daysLeft > 0) {
      triggerType = "bandb_objection_due_soon";
      message = `${afe.id} (Band B) objection window closes in ~${daysLeft} day(s).`;
    } else if (daysLeft === 0) {
      triggerType = "bandb_objection_window_elapsed";
      message = `${afe.id} (Band B) objection window has elapsed — silence is deemed approval.`;
    }
    await notifySilvaRoles({
      programId,
      triggerType,
      entityType: "afe",
      entityId: afe.id,
      message,
      dedupeHours: daysLeft <= 2 ? 12 : 24,
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
  const week = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const expiring = await prisma.vendors.findMany({
    where: { insuranceExpiry: { lte: soon, gte: new Date() } },
  });
  for (const vendor of expiring) {
    const daysLeft = daysBetween(new Date(), new Date(vendor.insuranceExpiry));
    const urgency =
      daysLeft <= 1 ? "tomorrow" : daysLeft <= 7 ? `in ${daysLeft} days` : `on ${vendor.insuranceExpiry.toISOString().slice(0, 10)}`;
    await createNotification({
      triggerType: "insurance_expiring",
      entityType: "vendor",
      entityId: vendor.id,
      recipientRole: "spx_account_handler",
      message: `Insurance for ${vendor.name} expires ${urgency}.`,
      dedupeHours: vendor.insuranceExpiry <= week ? 12 : 24,
    });
    await createNotification({
      triggerType: "insurance_expiring",
      entityType: "vendor",
      entityId: vendor.id,
      recipientRole: "spx_principal",
      message: `Insurance for ${vendor.name} expires ${urgency}.`,
      dedupeHours: vendor.insuranceExpiry <= week ? 12 : 24,
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
