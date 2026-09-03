const prisma = require("../../config/database");
const { activityLineCosts } = require("../costDerivation.service");
const { getApprovedRateByCode } = require("./rateMap.service");
const { requireProgramId } = require("../utils/programScope");
const { isFarmOwner } = require("../../utils/cropfortRoles");

function ticketCostEtb(ticket, rateMap) {
  const costs = activityLineCosts(ticket.actualQty, ticket.activity, rateMap);
  return costs.totalCostEtb;
}

function budgetLineCost(line, rateMap) {
  const costs = activityLineCosts(line.plannedQty, line.activity, rateMap);
  return costs.totalCostEtb;
}

function variancePct(budget, actual) {
  if (!budget || budget === 0) return actual > 0 ? 100 : 0;
  return Number((((actual - budget) / budget) * 100).toFixed(2));
}

function opexStatus(balance, required) {
  if (balance == null || required == null) return "unknown";
  if (balance >= required) return "adequate";
  if (balance >= required * 0.75) return "warning";
  return "critical";
}

exports.getDashboard = async (user, query) => {
  const programId = requireProgramId(user);
  const farmOwner = await isFarmOwner(user.id, programId);
  const planYear = query.planYear ? Number(query.planYear) : new Date().getUTCFullYear();

  const program = await prisma.programs.findUnique({
    where: { id: programId },
    select: {
      cropfortOpexReserveMinMonths: true,
      cropfortOpexReserveBalanceEtb: true,
      cropfortOpexEnforcement: true,
      cropfortPartialWeeklyRelease: true,
    },
  });

  const rateMap = await getApprovedRateByCode(programId);

  const budgetLines = await prisma.afp_block_lines.findMany({
    where: {
      programId,
      planYear,
      status: "approved",
      electionStatus: "elected",
    },
    include: {
      activity: true,
      block: { select: { id: true, code: true, label: true } },
    },
  });

  const budgetByKey = new Map();
  for (const line of budgetLines) {
    const key = `${line.blockId}:${line.activityId}`;
    const cost = budgetLineCost(line, rateMap);
    const existing = budgetByKey.get(key) ?? {
      blockId: line.blockId,
      blockCode: line.block.code,
      blockLabel: line.block.label,
      activityId: line.activityId,
      activityCode: line.activity.code,
      activityName: line.activity.name,
      budgetEtb: 0,
    };
    existing.budgetEtb = Number((existing.budgetEtb + cost).toFixed(2));
    budgetByKey.set(key, existing);
  }

  const ticketWhere = { programId, status: "released" };
  if (query.blockId) ticketWhere.blockId = query.blockId;

  const releasedTickets = await prisma.block_field_tickets.findMany({
    where: ticketWhere,
    include: {
      activity: true,
      block: { select: { id: true, code: true, label: true } },
    },
  });

  const actualByKey = new Map();
  for (const ticket of releasedTickets) {
    const key = `${ticket.blockId}:${ticket.activityId}`;
    const cost = ticketCostEtb(ticket, rateMap);
    const existing = actualByKey.get(key) ?? {
      blockId: ticket.blockId,
      blockCode: ticket.block.code,
      blockLabel: ticket.block.label,
      activityId: ticket.activityId,
      activityCode: ticket.activity.code,
      activityName: ticket.activity.name,
      actualEtb: 0,
      ticketCount: 0,
    };
    existing.actualEtb = Number((existing.actualEtb + cost).toFixed(2));
    existing.ticketCount += 1;
    actualByKey.set(key, existing);
  }

  const allKeys = new Set([...budgetByKey.keys(), ...actualByKey.keys()]);
  const bvaRows = [];
  let totalBudget = 0;
  let totalActual = 0;

  for (const key of allKeys) {
    const budget = budgetByKey.get(key);
    const actual = actualByKey.get(key);
    const budgetEtb = budget?.budgetEtb ?? 0;
    const actualEtb = actual?.actualEtb ?? 0;
    totalBudget += budgetEtb;
    totalActual += actualEtb;
    bvaRows.push({
      blockId: budget?.blockId ?? actual?.blockId,
      blockCode: budget?.blockCode ?? actual?.blockCode,
      blockLabel: budget?.blockLabel ?? actual?.blockLabel,
      activityId: budget?.activityId ?? actual?.activityId,
      activityCode: budget?.activityCode ?? actual?.activityCode,
      activityName: budget?.activityName ?? actual?.activityName,
      budgetEtb,
      actualEtb,
      varianceEtb: Number((actualEtb - budgetEtb).toFixed(2)),
      variancePct: variancePct(budgetEtb, actualEtb),
      releasedTickets: actual?.ticketCount ?? 0,
    });
  }

  bvaRows.sort((a, b) => a.blockCode.localeCompare(b.blockCode) || a.activityCode.localeCompare(b.activityCode));

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthlyTickets = releasedTickets.filter((t) => new Date(t.releasedAt) >= monthStart);
  let monthlyBurn = 0;
  for (const t of monthlyTickets) {
    monthlyBurn += ticketCostEtb(t, rateMap);
  }
  monthlyBurn = Number(monthlyBurn.toFixed(2));

  const reserveMonths = Number(program?.cropfortOpexReserveMinMonths ?? 6);
  const reserveRequired = Number((monthlyBurn * reserveMonths).toFixed(2));
  const reserveBalance =
    program?.cropfortOpexReserveBalanceEtb != null
      ? Number(program.cropfortOpexReserveBalanceEtb)
      : null;

  const weeklySubmissions = await prisma.weekly_submissions.findMany({
    where: { programId },
    include: {
      tickets: {
        include: {
          blockFieldTicket: {
            include: { activity: true },
          },
        },
      },
    },
    orderBy: { weekEnding: "desc" },
    take: 12,
  });

  const weeklyRollup = weeklySubmissions.map((ws) => {
    let weekTotal = 0;
    for (const link of ws.tickets) {
      const ticket = link.blockFieldTicket;
      if (!ticket) continue;
      if (farmOwner && ticket.status !== "released") continue;
      weekTotal += ticketCostEtb(ticket, rateMap);
    }
    return {
      id: ws.id,
      weekEnding: ws.weekEnding,
      status: ws.status,
      ticketCount: ws.tickets.length,
      totalEtb: Number(weekTotal.toFixed(2)),
      submittedAt: ws.submittedAt,
      releasedAt: ws.releasedAt,
    };
  });

  return {
    currency: "ETB",
    planYear,
    bva: {
      rows: bvaRows,
      totals: {
        budgetEtb: Number(totalBudget.toFixed(2)),
        actualEtb: Number(totalActual.toFixed(2)),
        varianceEtb: Number((totalActual - totalBudget).toFixed(2)),
        variancePct: variancePct(totalBudget, totalActual),
      },
    },
    opexReserve: {
      monthlyBurnEtb: monthlyBurn,
      reserveMonths,
      reserveRequiredEtb: reserveRequired,
      reserveBalanceEtb: reserveBalance,
      status: opexStatus(reserveBalance, reserveRequired),
      enforcement: program?.cropfortOpexEnforcement ?? "informational",
    },
    weeklyRollup,
    partialWeeklyRelease: program?.cropfortPartialWeeklyRelease ?? false,
  };
};
