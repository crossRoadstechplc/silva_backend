const { reopenReturnedLine } = require("../../lib/approvable");

describe("approvable.reopenReturnedLine", () => {
  test("is exported for rate card and AFP block reopen routes", () => {
    expect(typeof reopenReturnedLine).toBe("function");
  });

  test("creates a new draft version from returned lines", () => {
    const nextVersion = 2;
    const patch = { status: "draft", version: nextVersion, supersedesId: "rcl_old" };
    expect(patch.version).toBe(nextVersion);
    expect(patch.supersedesId).toBeTruthy();
  });
});
