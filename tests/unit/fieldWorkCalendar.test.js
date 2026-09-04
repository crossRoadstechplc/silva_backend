const {
  buildMonthLabels,
  buildIntensityCells,
  commercialStatusFor,
} = require("../../services/cropfort/fieldWorkCalendar.service");

describe("field work calendar seed helpers", () => {
  it("builds 36 month labels from term start", () => {
    const labels = buildMonthLabels(new Date("2026-01-01T00:00:00.000Z"));
    expect(labels).toHaveLength(36);
    expect(labels[0]).toEqual({ monthIndex: 1, monthLabel: "2026-01", yearSlice: 1 });
    expect(labels[11]).toMatchObject({ monthIndex: 12, yearSlice: 1 });
    expect(labels[12]).toMatchObject({ monthIndex: 13, yearSlice: 2 });
    expect(labels[35]).toMatchObject({ monthIndex: 36, yearSlice: 3 });
  });

  it("marks harvest window months Active with Peak at ends", () => {
    const cells = buildIntensityCells("Harvest Mgmt", "T2-001");
    expect(cells.length).toBeGreaterThan(0);
    const y1 = cells.filter((c) => c.monthIndex <= 12);
    expect(y1[0].intensity).toBe("peak");
    expect(y1[y1.length - 1].intensity).toBe("peak");
    expect(y1.slice(1, -1).every((c) => c.intensity === "active")).toBe(true);
    // Repeats across three years
    expect(cells.filter((c) => c.monthIndex === 1 || c.monthIndex === 13 || c.monthIndex === 25)).toHaveLength(
      3,
    );
  });

  it("omits intensity cells for institutional categories", () => {
    expect(buildIntensityCells("Institutional/Strategic", "T3-001")).toEqual([]);
  });

  it("maps commercial status by tier and category", () => {
    expect(commercialStatusFor("tier1", "Matured Coffee")).toBe("confirmed");
    expect(commercialStatusFor("tier2", "Coffee Ops")).toBe("elective");
    expect(commercialStatusFor("tier3", "Asset Development")).toBe("quoted");
  });
});
