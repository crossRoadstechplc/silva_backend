const {
  activityLineCosts,
  activityLaborUnitCost,
  hasLaborCosting,
  resolveQty,
} = require("../../services/costDerivation.service");

describe("costDerivation Cropfort Field OS", () => {
  const rateMap = new Map([
    ["MAT-008", 15],
    ["SVC-001", 1500],
  ]);

  const landClearing = {
    code: "T1-001",
    laborNorm: 20,
    laborWageEtb: 65,
    laborCostPerUnit: null,
    materialNorm: null,
    materialRateCode: null,
    serviceNorm: null,
    serviceRateCode: null,
  };

  it("computes labor as qty × norm × wage", () => {
    const costs = activityLineCosts(11.5, landClearing, rateMap);
    expect(costs.laborCostEtb).toBe(11.5 * 20 * 65);
    expect(costs.totalCostEtb).toBe(11.5 * 20 * 65);
  });

  it("prefers laborCostPerUnit when set", () => {
    const activity = { ...landClearing, laborCostPerUnit: 1244.895 };
    const costs = activityLineCosts(11.5, activity, rateMap);
    expect(costs.laborCostEtb).toBeCloseTo(11.5 * 1244.895, 2);
  });

  it("resolves ha qty from block area", () => {
    expect(resolveQty({ areaHa: 11.5 }, "ha", null)).toBe(11.5);
  });

  it("resolves tree qty from block treeCount", () => {
    expect(resolveQty({ treeCount: 19308 }, "No", null)).toBe(19308);
  });

  it("adds material cost when norm and rate code present", () => {
    const activity = {
      code: "T1-036",
      laborCostPerUnit: 100,
      materialNorm: 1,
      materialRateCode: "MAT-008",
    };
    const costs = activityLineCosts(10, activity, rateMap);
    expect(costs.laborCostEtb).toBe(1000);
    expect(costs.materialCostEtb).toBe(150);
    expect(costs.totalCostEtb).toBe(1150);
  });

  it("detects labor costing availability", () => {
    expect(hasLaborCosting(landClearing)).toBe(true);
    expect(hasLaborCosting({ code: "T3-001", laborNorm: 1 })).toBe(false);
  });

  it("activityLaborUnitCost returns norm × wage", () => {
    expect(activityLaborUnitCost(landClearing)).toBe(20 * 65);
  });
});
