const {
  loadCatalog,
  parseAnnualElection,
  parseActivityPlan,
  parseFeeSchedule,
  parseChakaMaster,
} = require("../../lib/cropfortFieldOsImport");
const { activityTierFromCode } = require("../../lib/cropfortCategoryWindows");
const { isElectionActive, electedPlanFilter } = require("../../lib/cropfortElection");
const { buildMonthlyRollup } = require("../../services/cropfort/feeSchedule.service");

const tierOf = (code) => activityTierFromCode(code);
const t1 = (code) => ({ activity: { code } });

describe("tier classification", () => {
  it("maps activity codes to tiers", () => {
    expect(tierOf("T1-001")).toBe("tier1");
    expect(tierOf("T2-010")).toBe("tier2");
    expect(tierOf("T3-001")).toBe("tier3");
    expect(tierOf("PRUNE-01")).toBeNull();
    expect(tierOf(undefined)).toBeNull();
  });

  it("splits the catalog into 52 Tier 1, 47 Tier 2 and 35 Tier 3 activities", () => {
    const { activities } = loadCatalog();
    const byTier = activities.reduce((acc, a) => {
      const tier = tierOf(a.code);
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {});
    expect(byTier).toEqual({ tier1: 52, tier2: 47, tier3: 35 });
    expect(activities).toHaveLength(134);
  });

  it("prices only Tier 1 by labour norm, since Tier 2 and 3 are fee-based", () => {
    const { activities } = loadCatalog();
    const priced = (tier) =>
      activities.filter(
        (a) => tierOf(a.code) === tier && (a.laborCostPerUnit != null || a.laborNorm != null),
      );
    expect(priced("tier1").length).toBeGreaterThan(0);
    expect(priced("tier2")).toHaveLength(0);
    expect(priced("tier3")).toHaveLength(0);
  });

  it("scopes Tier 1 units to blocks and Tier 2/3 units to the farm", () => {
    const { activities } = loadCatalog();
    const units = (tier) =>
      new Set(activities.filter((a) => tierOf(a.code) === tier).map((a) => a.unitOfMeasure));
    expect(units("tier1")).toContain("ha");
    expect(units("tier1")).toContain("tree");
    // Farm, project, assignment and sample units are not hectare or tree based,
    // which is why Tier 2/3 cannot be elected per block.
    expect(units("tier2")).toContain("farm");
    expect(units("tier3")).toContain("assignment");
    expect(units("tier3")).toContain("sample");
  });
});

describe("election semantics per tier", () => {
  const bundleOn = { coreBundleElected: true };
  const bundleOff = { coreBundleElected: false };

  it("elects Tier 1 from the core bundle when there is no override", () => {
    expect(isElectionActive(bundleOn, { ...t1("T1-001"), electionOverride: null })).toBe(true);
    expect(isElectionActive(bundleOff, { ...t1("T1-001"), electionOverride: null })).toBe(false);
  });

  it("lets a Tier 1 override win over the core bundle in both directions", () => {
    expect(isElectionActive(bundleOn, { ...t1("T1-001"), electionOverride: false })).toBe(false);
    expect(isElectionActive(bundleOff, { ...t1("T1-001"), electionOverride: true })).toBe(true);
  });

  it("requires an explicit election for Tier 2 and Tier 3", () => {
    for (const code of ["T2-010", "T3-001"]) {
      expect(isElectionActive(bundleOn, { ...t1(code), electionOverride: null })).toBe(false);
      expect(isElectionActive(bundleOn, { ...t1(code), electionOverride: false })).toBe(false);
      expect(isElectionActive(bundleOn, { ...t1(code), electionOverride: true })).toBe(true);
    }
  });

  it("never counts a plan that has no election row", () => {
    const filter = electedPlanFilter(bundleOn);
    expect(filter({ activity: { code: "T1-001" }, election: null })).toBe(false);
    expect(
      filter({ activity: { code: "T1-001" }, election: { electionOverride: null } }),
    ).toBe(true);
  });

  it("falls back to the plan's activity code when the election lacks one", () => {
    const filter = electedPlanFilter(bundleOn);
    expect(
      filter({ activity: { code: "T2-010" }, election: { electionOverride: true } }),
    ).toBe(true);
    expect(
      filter({ activity: { code: "T2-010" }, election: { electionOverride: null } }),
    ).toBe(false);
  });
});

describe("workbook tier structure", () => {
  it("elects Tier 1 across every block via one bundle tick", () => {
    const { coreBundleElected, elections } = parseAnnualElection();
    const { blocks } = parseChakaMaster();
    expect(coreBundleElected).toBe(true);

    const tier1 = elections.filter((e) => tierOf(e.activityCode) === "tier1");
    expect(tier1).toHaveLength(52 * blocks.length);
    expect(tier1.every((e) => e.blockCode)).toBe(true);
  });

  it("keeps Tier 2 and Tier 3 farm-wide and individually elected", () => {
    const { elections } = parseAnnualElection();
    const farmWide = elections.filter((e) => tierOf(e.activityCode) !== "tier1");
    expect(farmWide).toHaveLength(82);
    expect(farmWide.every((e) => e.blockCode === null)).toBe(true);

    const elected = farmWide.filter((e) => e.elected);
    expect(elected).toHaveLength(33);
    expect(elected.filter((e) => tierOf(e.activityCode) === "tier2")).toHaveLength(24);
    expect(elected.filter((e) => tierOf(e.activityCode) === "tier3")).toHaveLength(9);
  });

  it("carries opex on Tier 1 rows only, leaving Tier 2/3 to the fee schedule", () => {
    const plans = parseActivityPlan();
    const tier1 = plans.filter((p) => tierOf(p.activityCode) === "tier1");
    const farmWide = plans.filter((p) => tierOf(p.activityCode) !== "tier1");

    expect(tier1.reduce((s, p) => s + (p.plannedLaborCost || 0), 0)).toBeGreaterThan(0);
    expect(farmWide.every((p) => (p.plannedLaborCost || 0) === 0)).toBe(true);
    expect(farmWide.every((p) => (p.laborRatePerUnit || 0) === 0)).toBe(true);
  });

  it("drives hectare-based Tier 1 quantities from block area", () => {
    const plans = parseActivityPlan();
    const { blocks } = parseChakaMaster();
    const areaByBlock = new Map(blocks.map((b) => [b.code, b.areaHa]));

    const haRows = plans.filter((p) => p.unit === "ha" && p.blockCode);
    expect(haRows.length).toBeGreaterThan(0);
    for (const row of haRows) {
      expect(row.plannedQty).toBeCloseTo(areaByBlock.get(row.blockCode), 4);
    }
  });
});

describe("tier 2 and 3 fee schedule", () => {
  it("maps confirmed and elective fees to the right tiers", () => {
    const fee = parseFeeSchedule();
    expect(fee.coreAnnualFee).toBe(24375000);

    const byLabel = (needle) => fee.lines.find((l) => l.label.includes(needle));
    expect(byLabel("Coffee Operations")).toMatchObject({
      annualFee: 4750000,
      activationMonth: 1,
    });
    expect(byLabel("Export and Commercial")).toMatchObject({
      annualFee: 4250000,
      activationMonth: 13,
    });
    expect(byLabel("Technical and Laboratory")).toMatchObject({
      annualFee: 5000000,
      activationMonth: 1,
    });
    // Harvest management is inside the retainer; asset development and
    // strategic interventions are quoted per assignment.
    expect(fee.lines.filter((l) => l.deferred)).toHaveLength(3);
  });

  it("recurs each elective fee monthly from its activation month", () => {
    const fee = parseFeeSchedule();
    const rollup = buildMonthlyRollup(
      { confirmedAnnualFee: fee.coreAnnualFee, lines: fee.lines },
      new Date("2026-09-01T00:00:00.000Z"),
    );

    expect(rollup).toHaveLength(36);
    const at = (month) => rollup[month - 1];

    // Confirmed retainer is level across the term.
    expect(at(1).confirmedFeeEtb).toBeCloseTo(24375000 / 12, 2);
    expect(at(36).confirmedFeeEtb).toBeCloseTo(24375000 / 12, 2);

    // Months 1-12: Coffee Operations + Technical and Laboratory.
    expect(at(1).electiveFeeEtb).toBeCloseTo(812500, 2);
    expect(at(12).electiveFeeEtb).toBeCloseTo(812500, 2);

    // Export activates in month 13 and then persists.
    expect(at(13).electiveFeeEtb).toBeCloseTo(1166666.67, 2);
    expect(at(36).electiveFeeEtb).toBeCloseTo(1166666.67, 2);

    expect(at(1).feeEtb).toBeCloseTo(2843750, 2);
    expect(at(13).feeEtb).toBeCloseTo(3197916.67, 2);
    expect(at(36).cumulativeFeeEtb).toBeCloseTo(110875000, 0);
  });

  it("omits deferred lines entirely", () => {
    const rollup = buildMonthlyRollup(
      {
        confirmedAnnualFee: 1200,
        lines: [
          { annualFee: 1200, activationMonth: 1, deferred: true },
          { annualFee: null, activationMonth: null, deferred: true },
        ],
      },
      new Date("2026-09-01T00:00:00.000Z"),
    );
    expect(rollup[0].electiveFeeEtb).toBe(0);
    expect(rollup[0].feeEtb).toBeCloseTo(100, 2);
  });

  it("treats a missing activation month as active from month 1", () => {
    const rollup = buildMonthlyRollup(
      { confirmedAnnualFee: 0, lines: [{ annualFee: 1200, activationMonth: null }] },
      new Date("2026-09-01T00:00:00.000Z"),
    );
    expect(rollup[0].electiveFeeEtb).toBeCloseTo(100, 2);
    expect(rollup[35].electiveFeeEtb).toBeCloseTo(100, 2);
  });
});
