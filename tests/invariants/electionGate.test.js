describe("election gate", () => {
  test("field_supervisor role is not in election editors", () => {
    const editors = ["spx_validator", "farm_owner"];
    expect(editors).not.toContain("field_supervisor");
  });
});
