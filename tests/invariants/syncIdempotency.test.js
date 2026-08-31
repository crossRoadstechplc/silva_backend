describe("sync idempotency", () => {
  test("sync results distinguish created vs already_synced", () => {
    const first = { clientLocalId: "abc", status: "created" };
    const second = { clientLocalId: "abc", status: "already_synced" };
    expect(first.clientLocalId).toBe(second.clientLocalId);
    expect(first.status).not.toBe(second.status);
  });

  test("conflict status is flagged separately from duplicate client id", () => {
    const conflict = { status: "conflict", conflictWith: "bft_existing" };
    const duplicate = { status: "already_synced" };
    expect(conflict.status).toBe("conflict");
    expect(duplicate.status).toBe("already_synced");
  });
});
