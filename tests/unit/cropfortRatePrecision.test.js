const {
  parseLaborRateCard,
  parseBenchmarkSurveyDetail,
  parseActivityPlan,
} = require("../../lib/cropfortFieldOsImport");
const { reconcileCatalogRows } = require("../../lib/cropfortFieldOsSeed");

const decimals = (v) => {
  if (v == null) return 0;
  const s = String(v);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
};

describe("workbook rate precision", () => {
  it("strips Excel float noise from parsed rates", () => {
    const labor = parseLaborRateCard();
    const noisy = [...labor.values()].filter((v) => decimals(v.laborCostPerUnit) > 6);
    expect(noisy).toHaveLength(0);
    // 1215.57 and 1274.22 average to exactly 1244.895, not 1244.8950000000001.
    expect(labor.get("T1-001").laborCostPerUnit).toBe(1244.895);
    expect(labor.get("T1-003").laborCostPerUnit).toBe(39.885);
  });

  it("keeps benchmark rates at the 3 decimals a two-neighbour mean produces", () => {
    const detail = parseBenchmarkSurveyDetail();
    const rows = [...detail.values()].filter(
      (r) => r.neighbor1Rate != null && r.neighbor2Rate != null,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(decimals(row.proposedRate)).toBeLessThanOrEqual(3);
      expect(row.proposedRate).toBeCloseTo((row.neighbor1Rate + row.neighbor2Rate) / 2, 6);
    }
  });

  it("keeps labour norms that carry five decimals", () => {
    const labor = parseLaborRateCard();
    expect(labor.get("T1-005").laborNorm).toBe(0.00667);
    expect(labor.get("T1-021").laborNorm).toBe(0.66667);
    const deep = [...labor.values()].filter((v) => decimals(v.laborNorm) > 6);
    expect(deep).toHaveLength(0);
  });

  it("keeps planned labour cost equal to quantity times rate", () => {
    const plans = parseActivityPlan().filter((p) => p.plannedQty > 0 && p.laborRatePerUnit > 0);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(plan.plannedLaborCost).toBeCloseTo(plan.plannedQty * plan.laborRatePerUnit, 2);
    }
  });
});

describe("reconcileCatalogRows", () => {
  function fakeDelegate() {
    const updates = [];
    return { updates, update: async (args) => updates.push(args) };
  }

  it("rewrites rows whose stored rate was rounded", async () => {
    const delegate = fakeDelegate();
    const refreshed = await reconcileCatalogRows(
      delegate,
      [{ code: "T1-001", name: "Land Clearing", laborNorm: 20, laborCostPerUnit: 1244.895 }],
      [{ id: "act_1", code: "T1-001", name: "Land Clearing", laborNorm: 20, laborCostPerUnit: 1244.9 }],
    );
    expect(refreshed).toBe(1);
    expect(delegate.updates).toEqual([
      { where: { id: "act_1" }, data: { laborCostPerUnit: 1244.895 } },
    ]);
  });

  it("leaves already-matching rows untouched", async () => {
    const delegate = fakeDelegate();
    const refreshed = await reconcileCatalogRows(
      delegate,
      [{ code: "T1-001", name: "Land Clearing", laborNorm: 20, laborCostPerUnit: 1244.895 }],
      [
        {
          id: "act_1",
          code: "T1-001",
          name: "Land Clearing",
          laborNorm: 20,
          laborCostPerUnit: 1244.895,
        },
      ],
    );
    expect(refreshed).toBe(0);
    expect(delegate.updates).toHaveLength(0);
  });

  it("ignores rows that do not exist yet, since createMany inserts those", async () => {
    const delegate = fakeDelegate();
    const refreshed = await reconcileCatalogRows(
      delegate,
      [{ code: "T1-099", name: "New", laborNorm: 1 }],
      [],
    );
    expect(refreshed).toBe(0);
    expect(delegate.updates).toHaveLength(0);
  });

  it("treats a null-to-value change as drift", async () => {
    const delegate = fakeDelegate();
    const refreshed = await reconcileCatalogRows(
      delegate,
      [{ code: "T1-041", name: "Act", laborCostPerUnit: 12.175 }],
      [{ id: "act_41", code: "T1-041", name: "Act", laborCostPerUnit: null }],
    );
    expect(refreshed).toBe(1);
    expect(delegate.updates[0].data).toEqual({ laborCostPerUnit: 12.175 });
  });
});
