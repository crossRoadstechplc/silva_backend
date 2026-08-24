const prisma = require("../config/database");

/** Sets Postgres session variable for RLS policies when enabled on the DB role. */
module.exports = async function setProgramRls(req, res, next) {
  const programId = req.user?.activeProgramId;
  if (!programId) return next();
  try {
    await prisma.$executeRaw`SELECT set_config('app.program_id', ${programId}, true)`;
  } catch {
    // RLS optional — ignore if DB role cannot set config
  }
  return next();
};
