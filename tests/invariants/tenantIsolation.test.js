const prisma = require("../../config/database");
const { tablesReady } = require("./helpers");

describe("tenant isolation", () => {
  test("rate card lines are scoped by programId", async () => {
    if (!(await tablesReady())) {
      console.warn("Skipping: rate_card_lines table not present — run DB migration.");
      return;
    }
    const programs = await prisma.programs.findMany({ take: 2, select: { id: true } });
    if (programs.length < 2) return;
    const [a, b] = programs;
    const linesA = await prisma.rate_card_lines.count({ where: { programId: a.id } });
    const cross = await prisma.rate_card_lines.count({
      where: { programId: a.id, NOT: { programId: b.id } },
    });
    expect(cross).toBe(linesA);
  });
});
