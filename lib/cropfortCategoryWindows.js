/**
 * Default election window month offsets from farm term_start_date (spec §2.7).
 * Returns { startMonthOffset, endMonthOffset } from term start (0-indexed months).
 */
const CATEGORY_WINDOWS = {
  Nursery: { start: 0, end: 5 },
  "Young Coffee": { start: 0, end: 11 },
  "Matured Coffee": { start: 0, end: 11 },
  Infilling: { start: 8, end: 10 },
  "Picking & Related": { start: 0, end: 6 },
  "Harvest Mgmt": { start: 0, end: 6 },
  "Coffee Ops": { start: 1, end: 7 },
  "Coffee Operations": { start: 1, end: 7 },
  "Export & Commercial": { start: 3, end: 9 },
  "Technical & Lab": { start: 0, end: 11 },
  "Asset Development": null,
  "Institutional/Strategic": null,
  "Institutional & Strategic": null,
};

const ONE_TIME_BUILD_OUT_CODES = new Set(["T2-038", "T2-039", "T2-040"]);

function addMonths(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function computeElectionWindows(termStartDate, category, activityCode) {
  if (!termStartDate) return { defaultWindowStart: null, defaultWindowEnd: null };
  const base = new Date(termStartDate);
  let window = CATEGORY_WINDOWS[category];
  if (!window && category) {
    const match = Object.keys(CATEGORY_WINDOWS).find((k) =>
      category.toLowerCase().includes(k.toLowerCase().split(" ")[0]),
    );
    window = match ? CATEGORY_WINDOWS[match] : null;
  }
  if (!window) return { defaultWindowStart: null, defaultWindowEnd: null };
  let start = window.start;
  let end = window.end;
  if (ONE_TIME_BUILD_OUT_CODES.has(activityCode)) {
    start = 0;
    end = 2;
  }
  const defaultWindowStart = addMonths(base, start);
  const defaultWindowEnd = addMonths(base, end + 1);
  defaultWindowEnd.setUTCDate(defaultWindowEnd.getUTCDate() - 1);
  return { defaultWindowStart, defaultWindowEnd };
}

function computeEffectiveEndDate(windowStart, windowEnd, plannedDurationDays) {
  if (!windowStart) return null;
  if (plannedDurationDays != null && plannedDurationDays > 0) {
    const end = new Date(windowStart);
    end.setUTCDate(end.getUTCDate() + plannedDurationDays - 1);
    return end;
  }
  return windowEnd;
}

function activityTierFromCode(code) {
  if (code?.startsWith("T1-")) return "tier1";
  if (code?.startsWith("T2-")) return "tier2";
  if (code?.startsWith("T3-")) return "tier3";
  return null;
}

module.exports = {
  CATEGORY_WINDOWS,
  computeElectionWindows,
  computeEffectiveEndDate,
  activityTierFromCode,
};
