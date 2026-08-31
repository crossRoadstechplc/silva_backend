const prisma = require("../../config/database");

async function tablesReady() {
  try {
    await prisma.$queryRaw`SELECT 1 FROM rate_card_lines LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}

module.exports = { tablesReady };
