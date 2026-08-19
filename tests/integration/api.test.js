const request = require("supertest");

const hasDb = process.env.RUN_INTEGRATION === "1";

const maybe = hasDb ? describe : describe.skip;

maybe("Coffee Field OS API", () => {
  let app;
  let principalToken;
  let silvaToken;
  let vendorToken;
  let handlerToken;

  beforeAll(async () => {
    app = require("../../app");
    const login = async (email) => {
      const res = await request(app).post("/api/v1/auth/login").send({ email, password: "Password123!" });
      return res.body.data?.accessToken;
    };
    principalToken = await login("principal@spx.example");
    handlerToken = await login("handler@spx.example");
    silvaToken = await login("owner@silva.example");
    vendorToken = await login("lead@bagro.example");
  });

  afterAll(async () => {
    const prisma = require("../../config/database");
    await prisma.$disconnect();
  });

  test("login rejects bad password", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ email: "principal@spx.example", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  test("vendor cannot list AFE register", async () => {
    const res = await request(app).get("/api/v1/afes").set("Authorization", `Bearer ${vendorToken}`);
    expect(res.status).toBe(403);
  });

  test("Silva cannot list raw field tickets", async () => {
    const res = await request(app).get("/api/v1/field-tickets").set("Authorization", `Bearer ${silvaToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FIREWALL_VIOLATION");
  });

  test("non-principal cannot read revenue ledger", async () => {
    const res = await request(app).get("/api/v1/revenue-ledger").set("Authorization", `Bearer ${handlerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FIREWALL_VIOLATION");
  });

  test("principal can read revenue ledger", async () => {
    const res = await request(app).get("/api/v1/revenue-ledger").set("Authorization", `Bearer ${principalToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("AFE create computes band C and ignores client band", async () => {
    const res = await request(app)
      .post("/api/v1/afes")
      .set("Authorization", `Bearer ${handlerToken}`)
      .send({
        afpLineId: "AFP-2026-001",
        operatingDiscipline: "Infrastructure",
        description: "Test band compute",
        estimatedCostUsd: 32000,
        band: "A",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.band).toBe("C");
    expect(res.body.data.silvaApprovalRequired).toBe(true);
  });

  test("payment request before ticket sign-off is 422", async () => {
    const ticket = await request(app)
      .post("/api/v1/field-tickets")
      .set("Authorization", `Bearer ${vendorToken}`)
      .send({
        workOrderId: "WO-0001",
        activityRecorded: "Unsigned work",
        areaHa: 1,
        laborCount: 2,
        ticketDate: "2026-01-22",
      });
    expect(ticket.status).toBe(201);
    const pr = await request(app)
      .post("/api/v1/payment-requests")
      .set("Authorization", `Bearer ${vendorToken}`)
      .send({
        workOrderId: "WO-0001",
        fieldTicketId: ticket.body.data.id,
        type: "bagro_fee",
        amountRequestedEtb: 1000,
      });
    expect(pr.status).toBe(422);
    expect(pr.body.error.code).toBe("BUSINESS_RULE_VIOLATION");
  });

  test("vendor AFP list hides budget", async () => {
    const res = await request(app).get("/api/v1/afp-lines").set("Authorization", `Bearer ${vendorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].budgetAllocatedUsd).toBeNull();
  });
});
