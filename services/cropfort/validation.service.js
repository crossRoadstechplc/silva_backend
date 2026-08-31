const prisma = require("../../config/database");
const { uuid } = require("../../utils/ids");
const { laborCost } = require("../costDerivation.service");

const HARD_BLOCKS = new Set(["rate_card_compliance", "election_compliance"]);

const CHECK_META = [
  { checkType: "rate_card_compliance", isHardBlock: true },
  { checkType: "election_compliance", isHardBlock: true },
  { checkType: "afp_sequencing", isHardBlock: false },
  { checkType: "variance_review", isHardBlock: false },
  { checkType: "afe_band_check", isHardBlock: false },
  { checkType: "materials_estimate", isHardBlock: false },
];

async function getApprovedRateMap(programId) {
  const lines = await prisma.rate_card_lines.findMany({
    where: { programId, status: "approved" },
    orderBy: [{ resourceCode: "asc" }, { version: "desc" }],
  });
  const map = new Map();
  for (const line of lines) {
    if (!map.has(line.resourceCode)) map.set(line.resourceCode, Number(line.rateEtb));
  }
  return map;
}

async function loadWeeklyTickets(weeklySubmissionId) {
  const links = await prisma.weekly_submission_tickets.findMany({
    where: { weeklySubmissionId },
    include: {
      blockFieldTicket: {
        include: {
          activity: true,
          block: true,
        },
      },
    },
  });
  return links.map((l) => l.blockFieldTicket);
}

async function checkRateCardCompliance(programId, tickets) {
  const rateMap = await getApprovedRateMap(programId);
  const missing = tickets.filter((t) => !rateMap.has(t.activity.code));
  if (!missing.length) return { result: "pass", note: "All activities have approved rate card lines." };
  return {
    result: "fail",
    note: `Missing approved rates for: ${[...new Set(missing.map((t) => t.activity.code))].join(", ")}`,
  };
}

async function checkElectionCompliance(programId, tickets) {
  const failures = [];
  for (const ticket of tickets) {
    const line = await prisma.afp_block_lines.findFirst({
      where: {
        programId,
        blockId: ticket.blockId,
        activityId: ticket.activityId,
        electionStatus: "elected",
        status: "approved",
      },
    });
    if (!line) failures.push(`${ticket.block.code}/${ticket.activity.code}`);
  }
  if (!failures.length) return { result: "pass", note: "All tickets reference elected activities." };
  return { result: "fail", note: `Non-elected activities: ${failures.join(", ")}` };
}

async function checkAfpSequencing(programId, tickets) {
  const byBlock = new Map();
  for (const ticket of tickets) {
    if (!byBlock.has(ticket.blockId)) byBlock.set(ticket.blockId, []);
    byBlock.get(ticket.blockId).push(ticket);
  }
  const outOfOrder = [];
  for (const [blockId, blockTickets] of byBlock) {
    const lines = await prisma.afp_block_lines.findMany({
      where: { programId, blockId, status: "approved", electionStatus: "elected" },
      orderBy: { sequence: "asc" },
    });
    const seqMap = new Map(lines.map((l) => [l.activityId, l.sequence]));
    const sorted = [...blockTickets].sort(
      (a, b) => (seqMap.get(a.activityId) ?? 999) - (seqMap.get(b.activityId) ?? 999),
    );
    if (sorted.some((t, i) => t.id !== blockTickets[i]?.id)) {
      outOfOrder.push(blockTickets[0]?.block?.code ?? blockId);
    }
  }
  if (!outOfOrder.length) return { result: "pass", note: "Activities follow AFP sequence." };
  return { result: "flag", note: `Possible out-of-sequence work on blocks: ${outOfOrder.join(", ")}` };
}

async function checkVarianceReview(programId, tickets) {
  const program = await prisma.programs.findUnique({
    where: { id: programId },
    select: { cropfortVarianceReviewPct: true },
  });
  const threshold = Number(program?.cropfortVarianceReviewPct ?? 20);
  const flagged = [];

  for (const ticket of tickets) {
    const planned = ticket.plannedQty != null ? Number(ticket.plannedQty) : null;
    const actual = Number(ticket.actualQty);
    if (planned == null || planned === 0) continue;
    const variancePct = Math.abs(((actual - planned) / planned) * 100);
    if (variancePct > threshold) {
      flagged.push(`${ticket.block.code}/${ticket.activity.code} (${variancePct.toFixed(1)}%)`);
    }
  }

  if (!flagged.length) return { result: "pass", note: "Quantities within variance threshold." };
  return { result: "flag", note: `Variance review: ${flagged.join("; ")}` };
}

async function checkAfeBand(programId, tickets) {
  const program = await prisma.programs.findUnique({
    where: { id: programId },
    select: {
      cropfortAfeBandAMaxEtb: true,
      cropfortAfeBandBMaxEtb: true,
      cropfortAfeBandCMaxEtb: true,
    },
  });
  const rateMap = await getApprovedRateMap(programId);
  let weekTotal = 0;
  for (const ticket of tickets) {
    const rate = rateMap.get(ticket.activity.code) ?? 0;
    const activity = await prisma.activity_master.findUnique({ where: { id: ticket.activityId } });
    weekTotal += laborCost(ticket.actualQty, activity?.laborNorm, rate);
  }
  const bandC = Number(program?.cropfortAfeBandCMaxEtb ?? 5000000);
  if (weekTotal <= bandC) {
    return { result: "pass", note: `Weekly total ${weekTotal.toFixed(2)} ETB within AFE bands.` };
  }
  return { result: "flag", note: `Weekly total ${weekTotal.toFixed(2)} ETB exceeds band C ceiling.` };
}

async function checkMaterialsEstimate(_programId, tickets) {
  const flagged = tickets.filter((t) => {
    const materials = t.materialsUsed;
    return materials && typeof materials === "object" && Object.keys(materials).length > 5;
  });
  if (!flagged.length) return { result: "pass", note: "Materials within expected scope." };
  return { result: "flag", note: `${flagged.length} ticket(s) exceed materials estimate heuristics.` };
}

const RUNNERS = {
  rate_card_compliance: checkRateCardCompliance,
  election_compliance: checkElectionCompliance,
  afp_sequencing: checkAfpSequencing,
  variance_review: checkVarianceReview,
  afe_band_check: checkAfeBand,
  materials_estimate: checkMaterialsEstimate,
};

exports.hasHardBlockFailures = (checks) =>
  checks.some((c) => c.isHardBlock && (c.result === "fail" || c.result === "flag"));

exports.runChecks = async (programId, weeklySubmissionId) => {
  const tickets = await loadWeeklyTickets(weeklySubmissionId);
  await prisma.spx_validation_checks.deleteMany({ where: { weeklySubmissionId } });

  const checks = [];
  for (const meta of CHECK_META) {
    const outcome = await RUNNERS[meta.checkType](programId, tickets);
    const row = await prisma.spx_validation_checks.create({
      data: {
        id: uuid("svc"),
        programId,
        weeklySubmissionId,
        checkType: meta.checkType,
        result: outcome.result,
        isHardBlock: meta.isHardBlock,
        note: outcome.note,
      },
    });
    checks.push(row);
  }
  return checks;
};

exports.HARD_BLOCKS = HARD_BLOCKS;
