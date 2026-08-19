require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "test") {
  prisma.$connect().catch((err) => {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  });
}

module.exports = prisma;
