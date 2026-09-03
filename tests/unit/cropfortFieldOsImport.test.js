const {
  loadCatalog,
  parseChakaMaster,
  parseFeeSchedule,
  parseAnnualElection,
  parseActivityPlan,
} = require("../../lib/cropfortFieldOsImport");

describe("cropfortFieldOsImport", () => {
  it("loads 134 activities from template", () => {
    const catalog = loadCatalog();
    expect(catalog.activities.length).toBeGreaterThanOrEqual(130);
    expect(catalog.activities.some((a) => a.code === "T1-001")).toBe(true);
    expect(catalog.activities.some((a) => a.code.startsWith("T3-"))).toBe(true);
  });

  it("loads 20 material and service rate cards", () => {
    const catalog = loadCatalog();
    expect(catalog.materialRates.length).toBe(10);
    expect(catalog.serviceRates.length).toBe(10);
    expect(catalog.materialRates[0].resourceCode).toMatch(/^MAT-/);
  });

  it("loads Chaka Buna 20 blocks", () => {
    const catalog = loadCatalog();
    expect(catalog.chakaBlocks.length).toBe(20);
    expect(catalog.chakaBlocks[0].areaHa).toBe(11.5);
  });

  it("includes labor norms for Chetu-sourced activities", () => {
    const catalog = loadCatalog();
    const land = catalog.activities.find((a) => a.code === "T1-001");
    expect(land?.laborNorm).toBe(20);
    expect(land?.laborWageEtb).toBe(65);
  });
});

describe("Chaka Buna simulator sheets", () => {
  it("reads the Master header and full block registry", () => {
    const master = parseChakaMaster();
    expect(master.farmName).toMatch(/Chaka Buna/);
    expect(master.termStartDate.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(master.blocks).toHaveLength(20);
    const first = master.blocks[0];
    expect(first).toMatchObject({ code: "BLK-001", areaHa: 11.5, status: "active" });
    expect(first.treeCount).toBe(19308);
    expect(first.varietyPlanted).toMatch(/Landrace/);
    expect(master.blocks.reduce((s, b) => s + b.areaHa, 0)).toBe(230);
  });

  it("reads the confirmed core fee and elective fee lines", () => {
    const fee = parseFeeSchedule();
    expect(fee.coreAnnualFee).toBe(24375000);
    expect(fee.lines).toHaveLength(6);
    const coffeeOps = fee.lines.find((l) => l.label.includes("Coffee Operations"));
    expect(coffeeOps).toMatchObject({ annualFee: 4750000, activationMonth: 1, deferred: false });
    expect(fee.lines.filter((l) => l.deferred)).toHaveLength(3);
  });

  it("reads the core bundle tick with per-block and farm-wide elections", () => {
    const { coreBundleElected, elections } = parseAnnualElection();
    expect(coreBundleElected).toBe(true);
    expect(elections).toHaveLength(1122);
    expect(elections.filter((e) => e.blockCode)).toHaveLength(1040);
    const farmWide = elections.filter((e) => !e.blockCode);
    expect(farmWide).toHaveLength(82);
    expect(farmWide.filter((e) => e.elected)).toHaveLength(33);
    expect(elections[0].defaultWindowStart.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("reads planned quantities and labor rates from the Activity Plan", () => {
    const plans = parseActivityPlan();
    expect(plans).toHaveLength(1122);
    const landClearing = plans.find((p) => p.blockCode === "BLK-001" && p.activityCode === "T1-001");
    expect(landClearing).toMatchObject({ unit: "ha", elected: true, plannedQty: 11.5 });
    expect(landClearing.plannedLaborCost).toBeCloseTo(11.5 * landClearing.laborRatePerUnit, 4);
  });
});
