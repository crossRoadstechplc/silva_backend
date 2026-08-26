/**
 * Pipeline integration test — all three operating-model doors to a released report.
 *
 * Door 1: Annual AFP → planned AFE → WO → ticket → released report
 * Door 2: Silva activity request → convert → same chain
 * Door 3: Vendor activity request → convert → same chain
 *
 * Requires seeded DB (prg_shecha) and:
 *   RUN_INTEGRATION=1 npm run test:integration -- pipeline.test.js
 */

const request = require("supertest");

const hasDb = process.env.RUN_INTEGRATION === "1";
const maybe = hasDb ? describe : describe.skip;

const PASSWORD = "Password123!";
const AFP_LINE = "AFP-2026-001";
const VENDOR_ID = "vnd_bagro";

maybe("Pipeline — three doors to released report", () => {
  let app;
  let ownerToken;
  let handlerToken;
  let principalToken;
  let managerToken;
  let leadToken;
  let supervisorToken;

  const stamp = Date.now().toString(36);
  // Report ids are `rpt_<period>_monthly` — unique year per run avoids 409 on re-run
  const periodYear = 2200 + (Date.now() % 700);

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  const login = async (email) => {
    const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200) {
      throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.data.accessToken;
  };

  beforeAll(async () => {
    app = require("../../app");
    ownerToken = await login("owner@silva.example");
    handlerToken = await login("handler@spx.example");
    principalToken = await login("principal@spx.example");
    managerToken = await login("manager@bagro.example");
    leadToken = await login("lead@bagro.example");
    supervisorToken = await login("supervisor@bagro.example");
  }, 60000);

  afterAll(async () => {
    const prisma = require("../../config/database");
    await prisma.$disconnect();
  });

  /**
   * Shared spine from an approved-ready draft AFE through Silva reading a released report.
   * AFE must already exist as draft, created by handler (principal validates — maker-checker).
   */
  async function runChainFromDraftAfe(afeId, { reportPeriod, label }) {
    // Submit (handler)
    let res = await request(app)
      .post(`/api/v1/afes/${afeId}/submit`)
      .set(auth(handlerToken))
      .send({ comment: `${label} submit` });
    expect([200, 201]).toContain(res.status);
    expect(["submitted", "validated", "approved"].includes(res.body.data.status)).toBe(true);

    // Validate (principal — not creator)
    res = await request(app)
      .post(`/api/v1/afes/${afeId}/validate`)
      .set(auth(principalToken))
      .send({ comment: `${label} validate` });
    expect(res.status).toBe(200);
    expect(res.body.data.spxValidated).toBe(true);
    // Band A/B auto-approve on validate
    expect(["approved", "validated", "active"]).toContain(res.body.data.status);
    if (res.body.data.band === "A" || res.body.data.band === "B") {
      expect(res.body.data.status).toBe("approved");
    }

    // If somehow still validated (C/D), Silva approves
    if (res.body.data.status === "validated" && res.body.data.silvaApprovalRequired) {
      res = await request(app)
        .post(`/api/v1/afes/${afeId}/approve`)
        .set(auth(ownerToken))
        .send({ comment: `${label} silva approve` });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("approved");
    }

    // Create + issue WO (principal)
    res = await request(app)
      .post("/api/v1/work-orders")
      .set(auth(principalToken))
      .send({
        afeId,
        category: "Pipeline Test",
        activity: `${label} execution`,
        tier: "project",
        weekStart: 10,
        weekEnd: 12,
        assignedVendorId: VENDOR_ID,
      });
    expect(res.status).toBe(201);
    const woId = res.body.data.id;
    expect(res.body.data.afeId).toBe(afeId);

    res = await request(app).post(`/api/v1/work-orders/${woId}/issue`).set(auth(principalToken)).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("issued");

    // Field ticket: lead create+submit → supervisor vendor-review → handler validate
    const ticketDate = new Date().toISOString().slice(0, 10);
    res = await request(app)
      .post("/api/v1/field-tickets")
      .set(auth(leadToken))
      .send({
        workOrderId: woId,
        activityRecorded: `${label} field work`,
        areaHa: 1.5,
        laborCount: 4,
        ticketDate,
      });
    expect(res.status).toBe(201);
    const ftId = res.body.data.id;
    expect(res.body.data.workOrderId).toBe(woId);

    res = await request(app).post(`/api/v1/field-tickets/${ftId}/submit`).set(auth(leadToken)).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("submitted");

    res = await request(app)
      .post(`/api/v1/field-tickets/${ftId}/vendor-review`)
      .set(auth(supervisorToken))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("vendor_reviewed");

    res = await request(app)
      .post(`/api/v1/field-tickets/${ftId}/validate`)
      .set(auth(handlerToken))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("validated");

    // Report: generate → narrative → release
    res = await request(app)
      .post("/api/v1/reports/generate/monthly")
      .set(auth(handlerToken))
      .send({ period: reportPeriod });
    expect(res.status).toBe(201);
    const reportId = res.body.data.id;
    expect(res.body.data.status).toBe("draft");

    // Silva cannot read draft
    res = await request(app).get(`/api/v1/reports/${reportId}`).set(auth(ownerToken));
    expect([403, 404]).toContain(res.status);

    res = await request(app)
      .patch(`/api/v1/reports/${reportId}/narrative`)
      .set(auth(handlerToken))
      .send({ narrative: `${label}: SPX narrative for pipeline test ${stamp}.` });
    expect(res.status).toBe(200);

    res = await request(app).post(`/api/v1/reports/${reportId}/release`).set(auth(principalToken)).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("released");
    expect(res.body.data.visibleToSilva).toBe(true);

    // Silva reads released report — final point
    res = await request(app).get(`/api/v1/reports/${reportId}`).set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("released");
    expect(res.body.data.narrative).toContain(label);

    return { afeId, woId, ftId, reportId };
  }

  test("firewalls hold before doors run", async () => {
    let res = await request(app).get("/api/v1/afes").set(auth(managerToken));
    expect(res.status).toBe(403);

    res = await request(app).get("/api/v1/field-tickets").set(auth(ownerToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FIREWALL_VIOLATION");

    // Silva cannot convert
    res = await request(app)
      .post("/api/v1/activity-requests/act_01/convert")
      .set(auth(ownerToken))
      .send({ estimatedCostUsd: 1000, operatingDiscipline: "Quality" });
    expect(res.status).toBe(403);
  });

  test("Door 1 — Annual AFP planned AFE reaches released report", async () => {
    const label = `Door1-Annual-${stamp}`;
    let res = await request(app)
      .post("/api/v1/afes")
      .set(auth(handlerToken))
      .send({
        afpLineId: AFP_LINE,
        operatingDiscipline: "Agronomic Operations",
        description: label,
        estimatedCostUsd: 1200,
        planningMode: "planned",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.afpLineId).toBe(AFP_LINE);
    expect(res.body.data.planningMode || "planned").toBe("planned");
    expect(res.body.data.band).toBe("A");
    const afeId = res.body.data.id;

    const out = await runChainFromDraftAfe(afeId, {
      reportPeriod: `${periodYear}-01`,
      label,
    });
    expect(out.reportId).toBeTruthy();
    expect(out.woId).toBeTruthy();
  }, 120000);

  test("Door 2 — Silva activity request → convert → released report", async () => {
    const label = `Door2-Silva-${stamp}`;

    let res = await request(app)
      .post("/api/v1/activity-requests")
      .set(auth(ownerToken))
      .send({
        requestType: "coffee_testing",
        title: label,
        description: "Pipeline cupping request",
        urgency: "normal",
        suggestedAfpLineId: AFP_LINE,
        farmEstateId: "fest_chetu",
        blockCode: "C",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.origin).toBe("silva_request");
    expect(res.body.data.status).toBe("submitted");
    const requestId = res.body.data.id;

    // Vendor cannot see Silva request queue as their own list shape — SPX can
    res = await request(app)
      .get("/api/v1/activity-requests")
      .query({ status: "submitted" })
      .set(auth(handlerToken));
    expect(res.status).toBe(200);
    const found = (res.body.data || []).find((r) => r.id === requestId);
    expect(found).toBeTruthy();

    res = await request(app)
      .post(`/api/v1/activity-requests/${requestId}/convert`)
      .set(auth(handlerToken))
      .send({
        estimatedCostUsd: 1500,
        operatingDiscipline: "Quality",
        afpLineId: AFP_LINE,
        description: label,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("converted");
    expect(res.body.data.convertedAfeId).toBeTruthy();
    const afeId = res.body.data.convertedAfeId;
    const afe = res.body.data.convertedAfe || (await request(app).get(`/api/v1/afes/${afeId}`).set(auth(handlerToken))).body.data;
    expect(afe.planningMode).toBe("ad_hoc");
    expect(afe.origin).toBe("silva_request");
    expect(afe.activityRequestId).toBe(requestId);
    expect(afe.afpLineId).toBe(AFP_LINE);

    await runChainFromDraftAfe(afeId, { reportPeriod: `${periodYear}-02`, label });

    res = await request(app).get(`/api/v1/activity-requests/${requestId}`).set(auth(ownerToken));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("converted");
    expect(res.body.data.convertedAfeId).toBe(afeId);
  }, 120000);

  test("Door 3 — Vendor activity request → convert → released report", async () => {
    const label = `Door3-Vendor-${stamp}`;

    let res = await request(app)
      .post("/api/v1/activity-requests")
      .set(auth(managerToken))
      .send({
        requestType: "urgent_field_work",
        title: label,
        description: "Urgent extra pruning after field review",
        urgency: "high",
        suggestedAfpLineId: AFP_LINE,
        farmEstateId: "fest_chetu",
        blockCode: "A",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.origin).toBe("vendor_request");
    expect(res.body.data.status).toBe("submitted");
    const requestId = res.body.data.id;

    // Vendor still cannot list AFE register
    res = await request(app).get("/api/v1/afes").set(auth(managerToken));
    expect(res.status).toBe(403);

    res = await request(app)
      .post(`/api/v1/activity-requests/${requestId}/convert`)
      .set(auth(handlerToken))
      .send({
        estimatedCostUsd: 1800,
        operatingDiscipline: "Agronomic Operations",
        afpLineId: AFP_LINE,
        description: label,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("converted");
    const afeId = res.body.data.convertedAfeId;
    const afe =
      res.body.data.convertedAfe ||
      (await request(app).get(`/api/v1/afes/${afeId}`).set(auth(handlerToken))).body.data;
    expect(afe.planningMode).toBe("ad_hoc");
    expect(afe.origin).toBe("vendor_request");
    expect(afe.activityRequestId).toBe(requestId);

    await runChainFromDraftAfe(afeId, { reportPeriod: `${periodYear}-03`, label });

    // Silva never sees vendor intake object; they see outcomes via released report / AFE if allowed
    res = await request(app).get("/api/v1/activity-requests").set(auth(ownerToken));
    expect(res.status).toBe(200);
    const silvaSeesVendor = (res.body.data || []).some((r) => r.id === requestId);
    expect(silvaSeesVendor).toBe(false);
  }, 120000);
});
