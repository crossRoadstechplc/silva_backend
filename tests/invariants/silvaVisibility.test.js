const { applyFarmOwnerListFilter } = require("../../lib/visibilityGate");

describe("silva visibility gate", () => {
  test("farm owner list filter restricts to approved", () => {
    const where = applyFarmOwnerListFilter({ programId: "p1" }, true);
    expect(where.status).toEqual({ in: ["approved"] });
  });

  test("spx sees all statuses in filter", () => {
    const where = applyFarmOwnerListFilter({ programId: "p1" }, false);
    expect(where.status).toBeUndefined();
  });
});
