const request = require("supertest");

const hasDb = process.env.RUN_INTEGRATION === "1";
const maybe = hasDb ? describe : describe.skip;

maybe("Operating Model v2", () => {
  let app;
  let handlerToken;
  let silvaToken;
  let leadToken;
  let managerToken;
  let principalToken;

  beforeAll(async () => {
    app = require("../../app");
    const login = async (email) => {
      const res = await request(app).post("/api/v1/auth/login").send({ email, password: "Password123!" });
      return res.body.data?.accessToken;
    };
    handlerToken = await login("handler@spx.example");
    silvaToken = await login("owner@silva.example");
    leadToken = await login("lead@bagro.example");
    managerToken = await login("manager@bagro.example");
    principalToken = await login("principal@spx.example");
  });

  afterAll(async () => {
    const prisma = require("../../config/database");
    await prisma.$disconnect();
  });

  test("Silva can create activity request", async () => {
    const res = await request(app)
      .post("/api/v1/activity-requests")
      .set("Authorization", `Bearer ${silvaToken}`)
      .send({
        requestType: "coffee_testing",
        title: "Integration cupping panel",
        description: "Verify operating model intake path",
        urgency: "normal",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("submitted");
  });

  test("SPX Planner can convert activity request to ad-hoc AFE", async () => {
    const list = await request(app)
      .get("/api/v1/activity-requests?status=submitted")
      .set("Authorization", `Bearer ${handlerToken}`);
    expect(list.status).toBe(200);
    const req = list.body.data.find((r) => r.title === "Integration cupping panel") || list.body.data[0];
    expect(req).toBeTruthy();
    const res = await request(app)
      .post(`/api/v1/activity-requests/${req.id}/convert`)
      .set("Authorization", `Bearer ${handlerToken}`)
      .send({
        operatingDiscipline: "Quality",
        estimatedCostUsd: 1200,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.planningMode).toBe("ad_hoc");
  });

  test("ad-hoc AFE skips AFP budget envelope when no AFP link", async () => {
    const res = await request(app)
      .post("/api/v1/afes")
      .set("Authorization", `Bearer ${handlerToken}`)
      .send({
        operatingDiscipline: "Quality",
        description: "Standalone ad-hoc test",
        estimatedCostUsd: 800,
        planningMode: "ad_hoc",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.afpLineId).toBeNull();
  });

  test("planned AFE rejects when AFP budget exceeded", async () => {
    const res = await request(app)
      .post("/api/v1/afes")
      .set("Authorization", `Bearer ${handlerToken}`)
      .send({
        afpLineId: "AFP-2026-001",
        operatingDiscipline: "Infrastructure",
        description: "Budget buster",
        estimatedCostUsd: 999999,
        planningMode: "planned",
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("BUSINESS_RULE_VIOLATION");
  });

  test("IFS validate requires vendor_reviewed", async () => {
    const create = await request(app)
      .post("/api/v1/ifs-forms")
      .set("Authorization", `Bearer ${leadToken}`)
      .send({
        formType: "daily_work_log",
        title: "Ops model log",
        workOrderId: "WO-0001",
        payload: { summary: "Test", hoursWorked: 4 },
      });
    expect(create.status).toBe(201);
    const formId = create.body.data.id;
    await request(app)
      .post(`/api/v1/ifs-forms/${formId}/submit`)
      .set("Authorization", `Bearer ${leadToken}`);
    const premature = await request(app)
      .post(`/api/v1/ifs-forms/${formId}/validate`)
      .set("Authorization", `Bearer ${handlerToken}`);
    expect(premature.status).toBe(400);
    await request(app)
      .post(`/api/v1/ifs-forms/${formId}/vendor-review`)
      .set("Authorization", `Bearer ${managerToken}`);
    const validated = await request(app)
      .post(`/api/v1/ifs-forms/${formId}/validate`)
      .set("Authorization", `Bearer ${handlerToken}`);
    expect(validated.status).toBe(200);
    expect(validated.body.data.status).toBe("validated");
  });

  test("SPX can list curatable logs and patch report sections", async () => {
    const logs = await request(app)
      .get("/api/v1/reports/curatable-logs/list")
      .set("Authorization", `Bearer ${handlerToken}`);
    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.body.data)).toBe(true);

    const drafts = await request(app)
      .get("/api/v1/reports?status=draft")
      .set("Authorization", `Bearer ${handlerToken}`);
    expect(drafts.status).toBe(200);
    const report = drafts.body.data[0];
    if (!report) return;
    const patch = await request(app)
      .patch(`/api/v1/reports/${report.id}/sections`)
      .set("Authorization", `Bearer ${handlerToken}`)
      .send({ includeLogIds: logs.body.data.slice(0, 1).map((l) => l.id) });
    expect(patch.status).toBe(200);
    expect(patch.body.data.sections).toBeTruthy();
  });

  test("vendor manager can list intake vendor AFE drafts", async () => {
    const create = await request(app)
      .post("/api/v1/afes")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        operatingDiscipline: "Agronomic Operations",
        description: "Manager originated need",
        estimatedCostUsd: 2500,
      });
    expect(create.status).toBe(201);
    expect(create.body.data.origin).toBe("vendor_request");
    const intake = await request(app)
      .get("/api/v1/afes/intake/vendor")
      .set("Authorization", `Bearer ${handlerToken}`);
    expect(intake.status).toBe(200);
    expect(intake.body.data.some((a) => a.description === "Manager originated need")).toBe(true);
  });
});
