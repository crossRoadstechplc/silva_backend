require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

async function connectWithRetry(maxAttempts = 5, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$connect();
      if (attempt > 1) {
        console.log(`Database connected on attempt ${attempt}.`);
      }
      return;
    } catch (err) {
      const isLast = attempt === maxAttempts;
      console.error(
        `Database connection attempt ${attempt}/${maxAttempts} failed:`,
        err.code || err.message,
      );
      if (isLast) {
        console.error(
          "Could not reach the database. Check DATABASE_URL, Supabase project status (paused?), and network.",
        );
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

if (process.env.NODE_ENV !== "test") {
  connectWithRetry().catch((err) => {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  });
}

module.exports = prisma;
