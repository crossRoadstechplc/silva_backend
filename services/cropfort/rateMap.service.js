const prisma = require("../../config/database");

async function getApprovedRateByCode(programId, farmEstateId = null) {
  const lines = await prisma.rate_card_lines.findMany({
    where: {
      programId,
      status: "approved",
      OR: farmEstateId
        ? [{ farmEstateId }, { farmEstateId: null }]
        : [{ farmEstateId: null }],
    },
    orderBy: [{ resourceCode: "asc" }, { version: "desc" }],
  });
  const map = new Map();
  for (const line of lines) {
    const existing = map.get(line.resourceCode);
    if (!existing || line.farmEstateId) {
      map.set(line.resourceCode, Number(line.rateEtb));
    }
  }
  return map;
}

module.exports = { getApprovedRateByCode };
