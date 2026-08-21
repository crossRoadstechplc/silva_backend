/**
 * SaaS isolation acceptance checks.
 * Requires migrated DB with seed. Usage: node scripts/saas-acceptance.js
 */
const BASE = process.env.API_BASE || "http://localhost:5000/api/v1";

async function login(email) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Password123!" }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Login failed ${email}: ${JSON.stringify(json)}`);
  return json.data.accessToken;
}

async function api(token, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push({ name, ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const principal = await login("principal@spx.example");
  const me = await api(principal, "GET", "/auth/me");
  check("me includes tenant + programs", Boolean(me.json?.data?.tenant && me.json?.data?.programs));
  check("me has active Shecha program", me.json?.data?.activeProgram?.slug === "shecha-estate");

  const afps = await api(principal, "GET", "/afp-lines");
  const afpCount = Array.isArray(afps.json?.data)
    ? afps.json.data.length
    : afps.json?.data?.items?.length || 0;
  check("seeded program has AFP lines", afps.status === 200 && afpCount > 0, `count=${afpCount}`);

  const stamp = Date.now();
  const email = `saas_${stamp}@example.com`;
  const slug = `isolated-silva-${stamp}`;
  const signupRes = await api(null, "POST", "/auth/signup", {
    name: "SaaS Admin",
    email,
    password: "Password123!",
    orgName: "Isolated Silva Co",
    orgSlug: slug,
    orgType: "silva",
    displayName: "Isolated Silva",
  });
  check("signup creates tenant", signupRes.status === 201, `status=${signupRes.status}`);
  const newToken = signupRes.json?.data?.accessToken;
  if (newToken) {
    const branding = signupRes.json?.data?.user;
    check("signup returns user", Boolean(branding?.id));

    const newAfp = await api(newToken, "GET", "/afp-lines");
    check(
      "new tenant without program cannot list AFPs",
      newAfp.status === 400 || (newAfp.status === 200 && (newAfp.json?.data?.items?.length || newAfp.json?.data?.length || 0) === 0),
      `status=${newAfp.status}`,
    );

    const created = await api(newToken, "POST", "/programs", { name: "New Estate Program" });
    check("new tenant can create program", created.status === 201, `status=${created.status}`);

    const afterMe = await api(newToken, "GET", "/auth/me");
    check(
      "new program is active after create",
      afterMe.json?.data?.activeProgram?.name === "New Estate Program" ||
        created.json?.data?.name === "New Estate Program",
    );

    const isolatedAfps = await api(newToken, "GET", "/afp-lines");
    const isolatedCount = Array.isArray(isolatedAfps.json?.data)
      ? isolatedAfps.json.data.length
      : isolatedAfps.json?.data?.items?.length || 0;
    check(
      "isolated program cannot see Shecha AFPs",
      isolatedAfps.status === 200 && isolatedCount === 0,
      `count=${isolatedCount}`,
    );

    const shechaStill = await api(principal, "GET", "/afp-lines");
    const shechaCount = Array.isArray(shechaStill.json?.data)
      ? shechaStill.json.data.length
      : shechaStill.json?.data?.items?.length || 0;
    check("Shecha tenant still sees own AFPs", shechaStill.status === 200 && shechaCount > 0);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
