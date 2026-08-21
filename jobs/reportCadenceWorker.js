/**
 * Schedule 5 reporting cadence jobs (program-scoped).
 * Usage: node jobs/reportCadenceWorker.js weekly [programId]
 * If programId omitted, generates for every active program.
 */
const prisma = require("../config/database");
const platformService = require("../services/platform.service");

async function runForProgram(type, programId) {
  const principal = await prisma.users.findFirst({
    where: { role: "spx_principal", active: true, activeProgramId: programId },
  });
  const userRow =
    principal ||
    (await prisma.users.findFirst({
      where: {
        role: "spx_principal",
        active: true,
        organization: { programMemberships: { some: { programId } } },
      },
    }));
  if (!userRow) {
    console.warn(`Skip ${programId}: no spx_principal member.`);
    return null;
  }
  const org = await prisma.organizations.findUnique({ where: { id: userRow.organizationId } });
  const user = {
    id: userRow.id,
    role: userRow.role,
    organizationId: userRow.organizationId,
    organizationType: org?.type || "spx",
    activeProgramId: programId,
  };

  const now = new Date();
  let period;
  if (type === "weekly") period = now.toISOString().slice(0, 10);
  else if (type === "monthly") period = now.toISOString().slice(0, 7);
  else if (type === "quarterly") {
    const q = Math.floor(now.getUTCMonth() / 3) + 1;
    period = `${now.getUTCFullYear()}-Q${q}`;
  } else period = String(now.getUTCFullYear() + 1);

  const report = await platformService.generateReport(type, { period }, user);
  console.log(`Generated ${type} draft ${report.id} for program ${programId} period ${period}.`);
  return report;
}

async function main() {
  const type = process.argv[2] || "weekly";
  const programId = process.argv[3];
  if (!["weekly", "monthly", "quarterly", "annual"].includes(type)) {
    console.error("Usage: node jobs/reportCadenceWorker.js [weekly|monthly|quarterly|annual] [programId]");
    process.exit(1);
  }
  if (programId) {
    await runForProgram(type, programId);
  } else {
    const programs = await prisma.programs.findMany({ where: { status: "active" } });
    for (const p of programs) await runForProgram(type, p.id);
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runForProgram };
