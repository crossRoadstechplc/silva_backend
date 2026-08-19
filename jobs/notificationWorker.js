const prisma = require("../config/database");
const { createNotification } = require("./queues");

async function runNotificationSweep() {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 3600 * 1000);
  const pending = await prisma.afes.findMany({
    where: { silvaApprovalRequired: true, status: "validated", updatedAt: { lte: fiveDaysAgo } },
  });
  for (const afe of pending) {
    await createNotification({
      triggerType: "afe_pending",
      entityType: "afe",
      entityId: afe.id,
      recipientRole: "silva_owner",
      message: `${afe.id} has been pending Silva approval for more than 5 days.`,
    });
  }

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
}

if (require.main === module) {
  runNotificationSweep()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runNotificationSweep };
