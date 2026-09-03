/**
 * Cropfort demo verification — Waves 1–5 smoke checks.
 * Requires: seeded DB + server running (npm run dev).
 *
 * Usage: npm run verify:cropfort-demo
 */
const BASE = process.env.API_BASE || "http://localhost:5000/api/v1";
const PASSWORD = "Password123!";

const DEMO_WEEK = "2026-08-30";

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(json)}`);
  if (json.data?.requiresOtp || json.data?.requiresTotpEnrollment) {
    throw new Error(
      `Login for ${email} requires OTP/TOTP. Set CROPFORT_OTP_ON_LOGIN=false in server .env for demo.`,
    );
  }
  return json.data.accessToken;
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function countByStatus(rows, status) {
  return rows.filter((r) => r.status === status).length;
}

async function main() {
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  console.log(`Cropfort demo verification → ${BASE}\n`);

  let principal;
  let silva;
  let bagro;
  try {
    principal = await login("principal@spx.example");
    silva = await login("owner@silva.example");
    bagro = await login("lead@bagro.example");
  } catch (err) {
    console.error(err.message);
    console.error("\nStart the server (npm run dev) and seed (npm run prisma:seed) first.");
    process.exit(1);
  }

  // Wave 1 — rate card
  const rcSpx = await api(principal, "GET", "/cropfort/rate-card");
  check("SPX lists rate card", rcSpx.status === 200, `status=${rcSpx.status}`);
  const rcLines = rcSpx.json?.data ?? [];
  check("Catalog has 20 approved MAT/SVC lines", countByStatus(rcLines, "approved") >= 20);
  check("MAT-001 rate line present", rcLines.some((l) => l.resourceCode === "MAT-001"));
  check("Demo has draft rate line", countByStatus(rcLines, "draft") >= 1);

  const rcSilva = await api(silva, "GET", "/cropfort/rate-card?status=submitted");
  check("Silva lists submitted rate lines", rcSilva.status === 200, `status=${rcSilva.status}`);
  check(
    "Silva approval queue has demo submitted line",
    (rcSilva.json?.data ?? []).some((l) => l.resourceCode === "MAT-DEMO-SUBMIT"),
  );

  const rcSilvaDefault = await api(silva, "GET", "/cropfort/rate-card");
  check(
    "Silva default view hides drafts",
    !(rcSilvaDefault.json?.data ?? []).some((l) => l.status === "draft"),
  );

  // Wave 2 — AFP + budget
  const afpSpx = await api(principal, "GET", "/cropfort/afp-blocks?planYear=2026");
  check("SPX lists block AFP lines", afpSpx.status === 200);
  const afpLines = afpSpx.json?.data ?? [];
  check(
    "Demo has elected approved AFP line",
    afpLines.some((l) => l.electionStatus === "elected" && l.status === "approved"),
  );

  const budget = await api(principal, "GET", "/cropfort/budget?planYear=2026");
  check("Budget preview returns rows", budget.status === 200);
  check("Budget preview has totals", budget.json?.data?.totals?.totalCostEtb != null);

  const afpSilva = await api(silva, "GET", "/cropfort/afp-blocks?status=submitted");
  check("Silva AFP approval queue", afpSilva.status === 200);
  check(
    "Silva sees submitted AFP line",
    (afpSilva.json?.data ?? []).some((l) => l.status === "submitted"),
  );

  const afeSpx = await api(principal, "GET", "/cropfort/afes");
  check("SPX lists Cropfort AFEs", afeSpx.status === 200);
  check("Demo has Band B submitted AFE", (afeSpx.json?.data ?? []).some((a) => a.band === "B" && a.status === "submitted"));

  const bandPreview = await api(principal, "GET", "/cropfort/afes/band-preview?amountEtb=1850000");
  check("Band preview returns B", bandPreview.status === 200 && bandPreview.json?.data?.band === "B");

  const afeSilva = await api(silva, "GET", "/cropfort/afes?status=submitted");
  check("Silva AFE approval queue", afeSilva.status === 200);
  check(
    "Silva sees submitted AFE",
    (afeSilva.json?.data ?? []).some((a) => a.status === "submitted"),
  );

  // Wave 3 — field tickets + weekly validation
  const ticketsBagro = await api(bagro, "GET", `/cropfort/block-field-tickets?weekEnding=${DEMO_WEEK}`);
  check("B-Agro lists block field tickets", ticketsBagro.status === 200);
  const tickets = ticketsBagro.json?.data ?? [];
  check("Demo has draft ticket", countByStatus(tickets, "draft") >= 1);
  check("Demo has submitted ticket", countByStatus(tickets, "submitted") >= 1);

  const queue = await api(principal, "GET", "/cropfort/weekly-submissions/queue");
  check("SPX validation queue", queue.status === 200);
  check(
    "Queue has demo week",
    (queue.json?.data ?? []).some((w) => String(w.weekEnding).startsWith(DEMO_WEEK)),
  );

  const ticketsSilva = await api(silva, "GET", "/cropfort/block-field-tickets");
  check(
    "Silva cannot see unreleased tickets",
    (ticketsSilva.json?.data ?? []).every((t) => t.status === "released"),
    `count=${(ticketsSilva.json?.data ?? []).length}`,
  );

  // Wave 4 — dashboard, audit, admin
  const dashSpx = await api(principal, "GET", "/cropfort/dashboard?planYear=2026");
  check("SPX Cropfort dashboard", dashSpx.status === 200);
  check("Dashboard has BvA totals", dashSpx.json?.data?.bva?.totals?.budgetEtb != null);
  check("Dashboard has opex reserve", dashSpx.json?.data?.opexReserve?.status != null);

  const dashSilva = await api(silva, "GET", "/cropfort/dashboard?planYear=2026");
  check("Silva Cropfort dashboard", dashSilva.status === 200);

  const auditSpx = await api(principal, "GET", "/cropfort/audit?limit=10");
  check("SPX Cropfort audit", auditSpx.status === 200);

  const admin = await login("admin@spx.example");
  const tenantConfig = await api(admin, "GET", "/cropfort/admin/tenant-config");
  check("Admin tenant config", tenantConfig.status === 200);
  check("Admin lists users", (await api(admin, "GET", "/cropfort/admin/users")).status === 200);

  const estatesSpx = await api(principal, "GET", "/farm-estates?pageSize=50");
  check("SPX lists farm estates", estatesSpx.status === 200);
  const spxEstates = estatesSpx.json?.data?.items ?? estatesSpx.json?.data ?? [];
  check("SPX sees 7 B-Agro farms", spxEstates.length >= 7, `count=${spxEstates.length}`);

  const estatesSilva = await api(silva, "GET", "/farm-estates?pageSize=50");
  check("Silva lists farm estates", estatesSilva.status === 200);
  const silvaEstates = estatesSilva.json?.data?.items ?? estatesSilva.json?.data ?? [];
  check("Silva sees only Chaka Buna", silvaEstates.length === 1 && silvaEstates[0]?.id === "fest_chaka_buna");

  const workflow = await api(principal, "GET", "/cropfort/farms/fest_chaka_buna/workflow");
  check("Farm workflow journey", workflow.status === 200);
  check(
    "Workflow has 10 stages",
    (workflow.json?.data?.stages ?? []).length === 10,
    `count=${(workflow.json?.data?.stages ?? []).length}`,
  );

  const actLand = await api(principal, "GET", "/cropfort/activity-master?search=T1-001");
  const landId = (actLand.json?.data ?? []).find((a) => a.code === "T1-001")?.id;
  const estimate = await api(bagro, "POST", "/cropfort/budget/estimate", {
    blockIds: ["blk_chaka_blk_001"],
    activityIds: landId ? [landId] : [],
  });
  check("Budget estimate for T1-001 on Chaka block", estimate.status === 200, `status=${estimate.status}`);
  if (estimate.status === 200) {
    const total = estimate.json?.data?.totals?.totalCostEtb;
    check("T1-001 labor ~ order of magnitude", total != null && total > 10000, `total=${total}`);
  }

  const sync = await api(bagro, "POST", "/cropfort/block-field-tickets/sync", {
    tickets: [
      {
        clientLocalId: "demo-sync-1",
        blockId: "blk_chaka_blk_001",
        activityId: landId || "act_t1_001",
        weekEnding: DEMO_WEEK,
        actualQty: 12,
        laborHoursActual: 6,
        status: "draft",
      },
    ],
  });
  check("Offline sync endpoint", sync.status === 200);
  const syncAgain = await api(bagro, "POST", "/cropfort/block-field-tickets/sync", {
    tickets: [
      {
        clientLocalId: "demo-sync-1",
        blockId: "blk_chaka_blk_001",
        activityId: landId || "act_t1_001",
        weekEnding: DEMO_WEEK,
        actualQty: 12,
        laborHoursActual: 6,
        status: "draft",
      },
    ],
  });
  check(
    "Sync idempotent by clientLocalId",
    (syncAgain.json?.data ?? []).some((r) => r.status === "already_synced"),
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);

  if (!failed.length) {
    console.log("\nDemo click-path:");
    console.log("  SPX  principal@spx.example  → Dashboard (Cropfort ETB section), Rate Card, Validation Queue");
    console.log("  Silva owner@silva.example   → Dashboard (Cropfort ETB section), Approvals");
    console.log("  Admin admin@spx.example     → Settings → Cropfort admin");
    console.log("  B-Agro lead@bagro.example   → Weekly Entry (week ending 2026-08-30)");
  }

  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
