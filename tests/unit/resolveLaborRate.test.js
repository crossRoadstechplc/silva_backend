const { resolveLaborRate } = require("../../services/cropfort/resolveLaborRate.service");

jest.mock("../../config/database", () => ({
  benchmark_surveys: { findFirst: jest.fn() },
  labor_rate_cards: { findFirst: jest.fn() },
  activity_master: { findUnique: jest.fn() },
}));

const prisma = require("../../config/database");

describe("resolveLaborRate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prefers approved benchmark proposed rate", async () => {
    prisma.benchmark_surveys.findFirst.mockResolvedValue({
      id: "bms_1",
      proposedRate: 1244.895,
      status: "approved",
    });
    const result = await resolveLaborRate("fest_chaka_buna", "act_t1_001");
    expect(result.source).toBe("benchmark");
    expect(result.rateEtb).toBeCloseTo(1244.895);
  });

  it("falls back to labor card norm × wage", async () => {
    prisma.benchmark_surveys.findFirst.mockResolvedValue(null);
    prisma.labor_rate_cards.findFirst.mockResolvedValue({
      id: "lrc_1",
      normMandayPerUnit: 20,
      wageRatePerManday: 65,
    });
    const result = await resolveLaborRate("fest_chaka_buna", "act_t1_001");
    expect(result.source).toBe("labor_card");
    expect(result.rateEtb).toBe(20 * 65);
  });
});
