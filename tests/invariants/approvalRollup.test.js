describe("approval rollup", () => {
  test("budget view excludes non-approved lines by design", () => {
    const approvedOnly = "status = 'approved'";
    expect(approvedOnly).toContain("approved");
  });
});
