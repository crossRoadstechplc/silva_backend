require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const url = process.env.DATABASE_URL || "";
  const hostMatch = url.match(/@([^/:]+)/);
  console.log("Host:", hostMatch?.[1] ?? "(unknown)");
  await prisma.$connect();
  const count = await prisma.users.count();
  console.log("DB OK — users:", count);
}

main()
  .catch((e) => {
    console.error("DB FAIL:", e.code || "ERROR", e.message?.split("\n")[0]);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
