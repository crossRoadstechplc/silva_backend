const computeBand = require("../../services/utils/computeBand");

const thresholds = [
  { band: "A", minValueUsd: 0, maxValueUsd: 5000 },
  { band: "B", minValueUsd: 5001, maxValueUsd: 20000 },
  { band: "C", minValueUsd: 20001, maxValueUsd: 50000 },
  { band: "D", minValueUsd: 50001, maxValueUsd: null },
];

describe("computeBand", () => {
  test("Band A at 4500", () => {
    expect(computeBand(4500, thresholds)).toBe("A");
  });
  test("Band B at 5001", () => {
    expect(computeBand(5001, thresholds)).toBe("B");
  });
  test("Band C at 32000", () => {
    expect(computeBand(32000, thresholds)).toBe("C");
  });
  test("Band D above 50000", () => {
    expect(computeBand(75000, thresholds)).toBe("D");
  });
  test("defaults to D when empty", () => {
    expect(computeBand(100, [])).toBe("D");
  });
});
