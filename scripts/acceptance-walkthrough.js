/**
 * Acceptance checklist against Roles Spec + manuals.
 * Run with server up: node scripts/acceptance-walkthrough.js
 * Or: npm run test:integration
 */
const BASE = process.env.API_BASE || "http://localhost:5000/api/v1";

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(json)}`);
  return json.data.accessToken;
}

async function api(token, method, path) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const silva = await login("owner@silva.example");
  const principal = await login("principal@spx.example");
  const handler = await login("handler@spx.example").catch(() => login("account@spx.example").catch(() => null));
  const vendor = await login("lead@bagro.example");

  // Revenue firewall
  const revSilva = await api(silva, "GET", "/revenue-ledger");
  check("Silva blocked from revenue ledger", revSilva.status === 403, `status=${revSilva.status}`);

  const revVendor = await api(vendor, "GET", "/revenue-ledger");
  check("Vendor blocked from revenue ledger", revVendor.status === 403, `status=${revVendor.status}`);

  const revPrincipal = await api(principal, "GET", "/revenue-ledger");
  check("SPX Principal can read revenue ledger", revPrincipal.status === 200, `status=${revPrincipal.status}`);

  // D-01: Silva cannot read raw field tickets / payment requests
  const ftSilva = await api(silva, "GET", "/field-tickets");
  check("Silva blocked from field tickets", ftSilva.status === 403, `status=${ftSilva.status}`);

  const prSilva = await api(silva, "GET", "/payment-requests");
  check("Silva blocked from payment requests", prSilva.status === 403, `status=${prSilva.status}`);

  // Vendor can read own WOs / FTs
  const woVendor = await api(vendor, "GET", "/work-orders");
  check("Vendor can list work orders", woVendor.status === 200, `status=${woVendor.status}`);

  // Silva can read released reports only path works
  const reportsSilva = await api(silva, "GET", "/reports?type=monthly");
  check("Silva can list reports (released filter server-side)", reportsSilva.status === 200, `status=${reportsSilva.status}`);

  // Dashboards
  const dashSilva = await api(silva, "GET", "/dashboard/silva-owner?year=2026");
  check("Silva owner dashboard", dashSilva.status === 200, `status=${dashSilva.status}`);

  const dashSpx = await api(principal, "GET", "/dashboard/spx-management?year=2026");
  check("SPX management dashboard", dashSpx.status === 200, `status=${dashSpx.status}`);
  check(
    "SPX dashboard includes exceptions array",
    Array.isArray(dashSpx.json?.data?.exceptions),
    typeof dashSpx.json?.data?.exceptions,
  );
  check(
    "SPX Principal sees revenue summary",
    Boolean(dashSpx.json?.data?.revenueLedgerSummary),
  );

  const dashVendor = await api(vendor, "GET", "/dashboard/vendor-field");
  check("Vendor field dashboard", dashVendor.status === 200, `status=${dashVendor.status}`);
  check(
    "Vendor dashboard has no revenueLedgerSummary",
    !dashVendor.json?.data?.revenueLedgerSummary,
  );

  // Schedule 3/4 readable
  const s3 = await api(handler || principal, "GET", "/schedule3-thresholds");
  check("Schedule 3 thresholds readable", s3.status === 200);

  const s4 = await api(handler || principal, "GET", "/schedule4-insurance");
  check("Schedule 4 insurance readable", s4.status === 200);

  // Account handler cannot read revenue
  if (handler) {
    const revHandler = await api(handler, "GET", "/revenue-ledger");
    check("Account Handler blocked from revenue ledger", revHandler.status === 403, `status=${revHandler.status}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
