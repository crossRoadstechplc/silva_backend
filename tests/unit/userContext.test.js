const { ensureActiveProgram, ensureVendorId } = require("../../services/userContext.service");

jest.mock("../../config/database", () => ({
  program_memberships: { findMany: jest.fn() },
  users: { update: jest.fn() },
  vendors: { findFirst: jest.fn() },
}));

const prisma = require("../../config/database");

describe("userContext.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("ensureActiveProgram sets program when org has one membership", async () => {
    prisma.program_memberships.findMany.mockResolvedValue([{ programId: "prg_1" }]);
    prisma.users.update.mockResolvedValue({});

    const result = await ensureActiveProgram({
      id: "usr_1",
      organizationId: "org_1",
      activeProgramId: null,
    });

    expect(result).toBe("prg_1");
    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { id: "usr_1" },
      data: { activeProgramId: "prg_1" },
    });
  });

  test("ensureActiveProgram leaves null when multiple memberships", async () => {
    prisma.program_memberships.findMany.mockResolvedValue([
      { programId: "prg_1" },
      { programId: "prg_2" },
    ]);

    const result = await ensureActiveProgram({
      id: "usr_1",
      organizationId: "org_1",
      activeProgramId: null,
    });

    expect(result).toBeNull();
    expect(prisma.users.update).not.toHaveBeenCalled();
  });

  test("ensureVendorId resolves vendor from organization", async () => {
    prisma.vendors.findFirst.mockResolvedValue({ id: "vnd_1" });
    prisma.users.update.mockResolvedValue({});

    const result = await ensureVendorId({
      id: "usr_1",
      organizationId: "org_vendor",
      role: "vendor_admin",
      vendorId: null,
    });

    expect(result).toBe("vnd_1");
    expect(prisma.users.update).toHaveBeenCalledWith({
      where: { id: "usr_1" },
      data: { vendorId: "vnd_1" },
    });
  });
});
