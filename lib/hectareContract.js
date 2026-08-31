const prisma = require("../config/database");
const AppError = require("../utils/AppError");

async function assertHectareContract(programId, excludeBlockId = null) {
  const program = await prisma.programs.findUnique({
    where: { id: programId },
    select: { cropfortHectareContractTotal: true },
  });
  const contractTotal = program?.cropfortHectareContractTotal;
  if (contractTotal == null) return;

  const blocks = await prisma.farm_blocks.findMany({
    where: { programId },
    select: { id: true, areaHa: true },
  });

  const total = blocks.reduce((sum, block) => {
    if (excludeBlockId && block.id === excludeBlockId) return sum;
    return sum + Number(block.areaHa || 0);
  }, 0);

  if (total > Number(contractTotal)) {
    throw new AppError(
      422,
      "HECTARE_CONTRACT_EXCEEDED",
      `Total block area (${total.toFixed(2)} ha) exceeds program contract (${Number(contractTotal)} ha).`,
    );
  }
}

module.exports = { assertHectareContract };
