const {
  computeVariancePct,
  computeIsFlagged,
  rejectClientComputedFields,
} = require("../../services/costDerivation.service");
const AppError = require("../../utils/AppError");

describe("costDerivation.service", () => {
  test("computeVariancePct uses benchmark average", () => {
    expect(computeVariancePct(110, 100, 100)).toBe(10);
    expect(computeVariancePct(90, 100, null)).toBe(-10);
  });

  test("computeIsFlagged respects threshold", () => {
    expect(computeIsFlagged(11, 10)).toBe(true);
    expect(computeIsFlagged(9, 10)).toBe(false);
  });

  test("rejectClientComputedFields blocks client variance", () => {
    expect(() => rejectClientComputedFields({ variancePct: 5 })).toThrow(AppError);
  });
});
