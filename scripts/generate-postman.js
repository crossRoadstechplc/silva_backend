const fs = require("fs");
const path = require("path");

function headerJson() {
  return [{ key: "Content-Type", value: "application/json" }];
}

function req(name, method, urlPath, opts = {}) {
  const item = {
    name,
    request: {
      method,
      header: method === "GET" ? [] : headerJson(),
      url: `{{baseUrl}}${urlPath}`,
    },
  };
  if (opts.body) {
    item.request.body = { mode: "raw", raw: JSON.stringify(opts.body, null, 2) };
  }
  if (opts.description) item.request.description = opts.description;
  if (opts.auth === false) item.request.auth = { type: "noauth" };
  if (opts.bearer) {
    item.request.auth = {
      type: "bearer",
      bearer: [{ key: "token", value: opts.bearer, type: "string" }],
    };
  }
  if (opts.event) item.event = opts.event;
  return item;
}

const saveTokens = [
  {
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        "if (pm.response.code === 200 && pm.response.json().data) {",
        "  const d = pm.response.json().data;",
        "  if (d.accessToken) pm.environment.set('accessToken', d.accessToken);",
        "  if (d.refreshToken) pm.environment.set('refreshToken', d.refreshToken);",
        "  if (d.user && d.user.id) pm.environment.set('userId', d.user.id);",
        "}",
      ],
    },
  },
];

const saveId = (envKey, jsonPath) => [
  {
    listen: "test",
    script: {
      type: "text/javascript",
      exec: [
        `if (pm.response.code === 200 || pm.response.code === 201) {`,
        `  const d = pm.response.json().data;`,
        `  const id = ${jsonPath};`,
        `  if (id) pm.environment.set('${envKey}', id);`,
        `}`,
      ],
    },
  },
];

const collection = {
  info: {
    name: "Coffee Field OS",
    description:
      "SPX Coffee Field OS REST API (`/api/v1`).\n\n1. Select the Local environment.\n2. Run **Auth → Login as SPX principal** to store `accessToken`.\n3. Seed logins all use password `Password123!`.\n\nRole notes: revenue ledger is `spx_principal` only. Silva cannot list raw field tickets.",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  auth: {
    type: "bearer",
    bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }],
  },
  variable: [
    { key: "baseUrl", value: "http://localhost:3000/api/v1" },
    { key: "accessToken", value: "" },
  ],
  item: [
    {
      name: "Health",
      item: [req("Health", "GET", "/health", { auth: false })],
    },
    {
      name: "Auth",
      item: [
        req("Login as SPX principal", "POST", "/auth/login", {
          auth: false,
          body: { email: "principal@spx.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Login as system admin", "POST", "/auth/login", {
          auth: false,
          body: { email: "admin@spx.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Login as SPX handler", "POST", "/auth/login", {
          auth: false,
          body: { email: "handler@spx.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Login as SPX field supervisor", "POST", "/auth/login", {
          auth: false,
          body: { email: "supervisor@spx.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Login as Silva owner", "POST", "/auth/login", {
          auth: false,
          body: { email: "owner@silva.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Login as Silva country manager", "POST", "/auth/login", {
          auth: false,
          body: { email: "naomi@silva.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Login as Silva finance", "POST", "/auth/login", {
          auth: false,
          body: { email: "finance@silva.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Login as B-Agro admin", "POST", "/auth/login", {
          auth: false,
          body: { email: "admin@bagro.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Login as B-Agro field lead", "POST", "/auth/login", {
          auth: false,
          body: { email: "lead@bagro.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Login as B-Agro supervisor", "POST", "/auth/login", {
          auth: false,
          body: { email: "supervisor@bagro.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Login as B-Agro worker", "POST", "/auth/login", {
          auth: false,
          body: { email: "worker@bagro.example", password: "Password123!" },
          event: saveTokens,
        }),
        req("Me", "GET", "/auth/me"),
        req("Refresh", "POST", "/auth/refresh", {
          auth: false,
          body: { refreshToken: "{{refreshToken}}" },
          event: saveTokens,
        }),
        req("Logout", "POST", "/auth/logout", { body: { refreshToken: "{{refreshToken}}" } }),
        req("Forgot password", "POST", "/auth/password/forgot", {
          auth: false,
          body: { email: "principal@spx.example" },
        }),
        req("Reset password", "POST", "/auth/password/reset", {
          auth: false,
          body: { token: "{{resetToken}}", password: "Password123!" },
        }),
      ],
    },
    {
      name: "Organizations",
      item: [
        req("List organizations", "GET", "/organizations?page=1&pageSize=20"),
        req("Get organization", "GET", "/organizations/{{organizationId}}"),
        req("Create vendor organization", "POST", "/organizations", {
          body: { name: "New Vendor Ltd", type: "vendor", isDefaultExecutionPartner: false, category: "Harvest" },
        }),
        req("Patch organization", "PATCH", "/organizations/{{organizationId}}", {
          body: { name: "Updated Org Name" },
        }),
        req("List members", "GET", "/organizations/{{organizationId}}/members"),
        req("Create invite", "POST", "/organizations/{{organizationId}}/invites", {
          body: { email: "new.worker@bagro.example", role: "vendor_worker" },
        }),
        req("List invites", "GET", "/organizations/{{organizationId}}/invites?status=pending"),
        req("Accept invite", "POST", "/invites/{{inviteId}}/accept", {
          auth: false,
          body: { token: "{{inviteToken}}", name: "Sara Hailu", password: "Password123!" },
        }),
        req("Revoke invite", "POST", "/invites/{{inviteId}}/revoke", { body: {} }),
      ],
    },
    {
      name: "Users",
      item: [
        req("List users", "GET", "/users?page=1&pageSize=20"),
        req("Get user", "GET", "/users/{{userId}}"),
        req("Create user", "POST", "/users", {
          body: {
            name: "Omar",
            email: "omar@spx.example",
            role: "spx_account_handler",
            organizationId: "org_spx",
            password: "Password123!",
          },
        }),
        req("Patch user", "PATCH", "/users/{{userId}}", { body: { name: "Omar Updated" } }),
        req("Activate user", "POST", "/users/{{userId}}/activate", { body: {} }),
        req("Deactivate user", "POST", "/users/{{userId}}/deactivate", { body: {} }),
        req("Change membership role", "PATCH", "/memberships/{{membershipId}}/role", {
          body: { role: "vendor_supervisor" },
        }),
      ],
    },
    {
      name: "Dashboard",
      item: [
        req("Silva owner", "GET", "/dashboard/silva-owner?year=2026"),
        req("SPX management", "GET", "/dashboard/spx-management?year=2026"),
        req("Vendor field", "GET", "/dashboard/vendor-field"),
        req("Dashboard notifications", "GET", "/dashboard/notifications"),
      ],
    },
    {
      name: "AFP",
      item: [
        req("List AFP lines", "GET", "/afp-lines?year=2026"),
        req("Get AFP line", "GET", "/afp-lines/{{afpLineId}}"),
        req("Create AFP line", "POST", "/afp-lines", {
          body: {
            year: 2026,
            operatingDiscipline: "Agronomic Operations",
            activity: "Soil sampling & nutrition program launch",
            budgetAllocatedUsd: 18000,
            kpiTarget: "Soil tested on 100% of blocks",
            notes: null,
          },
          event: saveId("afpLineId", "d.id"),
        }),
        req("Update AFP (draft only)", "PATCH", "/afp-lines/{{afpLineId}}", {
          body: { notes: "Updated notes" },
        }),
        req("Submit AFP", "POST", "/afp-lines/{{afpLineId}}/submit", { body: { comment: "Ready for Silva" } }),
        req("Approve AFP (Silva)", "POST", "/afp-lines/{{afpLineId}}/approve", { body: { comment: "Approved" } }),
        req("Close AFP", "POST", "/afp-lines/{{afpLineId}}/close", { body: { comment: "Year closed" } }),
      ],
    },
    {
      name: "AFE",
      item: [
        req("List AFEs", "GET", "/afes?status=approved"),
        req("Get AFE", "GET", "/afes/{{afeId}}"),
        req("Create Band A AFE", "POST", "/afes", {
          body: {
            afpLineId: "{{afpLineId}}",
            operatingDiscipline: "Agronomic Operations",
            description: "Pruning Blocks 5 to 6",
            estimatedCostUsd: 4500,
          },
          event: saveId("afeId", "d.id"),
        }),
        req("Create Band C AFE", "POST", "/afes", {
          body: {
            afpLineId: "{{afpLineId}}",
            operatingDiscipline: "Infrastructure",
            description: "Washing station rehabilitation",
            estimatedCostUsd: 32000,
          },
        }),
        req("Update AFE (draft only)", "PATCH", "/afes/{{afeId}}", {
          body: { description: "Updated description" },
        }),
        req("Submit AFE", "POST", "/afes/{{afeId}}/submit", { body: { comment: "Submitted" } }),
        req("Validate AFE (SPX)", "POST", "/afes/{{afeId}}/validate", { body: { comment: "Validated" } }),
        req("Approve AFE", "POST", "/afes/{{afeId}}/approve", { body: { comment: "Approved" } }),
        req("Reject AFE", "POST", "/afes/{{afeId}}/reject", { body: { reason: "Scope too broad" } }),
        req("Close AFE", "POST", "/afes/{{afeId}}/close", { body: { comment: "Complete" } }),
        req("AFE history", "GET", "/afes/{{afeId}}/history"),
      ],
    },
    {
      name: "Work Orders",
      item: [
        req("List work orders", "GET", "/work-orders"),
        req("Get work order", "GET", "/work-orders/{{workOrderId}}"),
        req("Create work order", "POST", "/work-orders", {
          body: {
            afeId: "{{afeId}}",
            category: "Agronomic Operations",
            activity: "Scheduled pruning of Blocks 1 to 4",
            tier: "retainer",
            weekStart: 3,
            weekEnd: 6,
            spxOversightHoursL1: 4,
            spxOversightHoursL2: 2,
            spxOversightHoursL3: 0,
            assignedVendorId: null,
          },
          event: saveId("workOrderId", "d.id"),
        }),
        req("Update work order (draft)", "PATCH", "/work-orders/{{workOrderId}}", {
          body: { activity: "Updated activity" },
        }),
        req("Issue work order", "POST", "/work-orders/{{workOrderId}}/issue", { body: { comment: "Issued" } }),
        req("Start work order", "POST", "/work-orders/{{workOrderId}}/start", { body: {} }),
        req("Complete work order", "POST", "/work-orders/{{workOrderId}}/complete", { body: {} }),
        req("Close work order", "POST", "/work-orders/{{workOrderId}}/close", { body: { comment: "Closed" } }),
        req("List assignments", "GET", "/work-orders/{{workOrderId}}/assignments"),
        req("Add assignment", "POST", "/work-orders/{{workOrderId}}/assignments", {
          body: { userId: "usr_bagro_lead", roleOnOrder: "vendor_field_lead", isPrimary: true },
        }),
        req("Patch assignment", "PATCH", "/work-orders/{{workOrderId}}/assignments/{{assignmentId}}", {
          body: { isPrimary: true },
        }),
        req("List tasks", "GET", "/work-orders/{{workOrderId}}/tasks"),
        req("Create task", "POST", "/work-orders/{{workOrderId}}/tasks", {
          body: {
            title: "Mobilize 24 laborers",
            description: "Confirm attendance by 06:00.",
            assigneeUserId: "usr_bagro_worker",
            dueDate: "2026-01-21",
          },
          event: saveId("taskId", "d.id"),
        }),
      ],
    },
    {
      name: "Work Order Tasks",
      item: [
        req("Get task", "GET", "/work-order-tasks/{{taskId}}"),
        req("Update task", "PATCH", "/work-order-tasks/{{taskId}}", { body: { title: "Updated task" } }),
        req("Start task", "POST", "/work-order-tasks/{{taskId}}/start", { body: {} }),
        req("Complete task", "POST", "/work-order-tasks/{{taskId}}/complete", { body: {} }),
        req("Cancel task", "POST", "/work-order-tasks/{{taskId}}/cancel", { body: { reason: "Weather delay" } }),
      ],
    },
    {
      name: "Field Tickets",
      item: [
        req("List field tickets (SPX/vendor)", "GET", "/field-tickets"),
        req("Create field ticket (vendor)", "POST", "/field-tickets", {
          body: {
            workOrderId: "{{workOrderId}}",
            activityRecorded: "Pruning completed on Blocks 1-2",
            areaHa: 18.5,
            laborCount: 24,
            materialsUsed: "Pruning saws, marking tape",
            ticketDate: "2026-01-22",
          },
          event: saveId("fieldTicketId", "d.id"),
        }),
        req("Get field ticket", "GET", "/field-tickets/{{fieldTicketId}}"),
        req("Update field ticket (draft)", "PATCH", "/field-tickets/{{fieldTicketId}}", {
          body: { laborCount: 26 },
        }),
        req("Submit field ticket", "POST", "/field-tickets/{{fieldTicketId}}/submit", { body: {} }),
        req("Vendor review", "POST", "/field-tickets/{{fieldTicketId}}/vendor-review", { body: {} }),
        req("Validate (SPX)", "POST", "/field-tickets/{{fieldTicketId}}/validate", { body: { comment: "Signed off" } }),
        req("Reject field ticket", "POST", "/field-tickets/{{fieldTicketId}}/reject", {
          body: { reason: "Area overstated" },
        }),
        req("Field ticket history", "GET", "/field-tickets/{{fieldTicketId}}/history"),
      ],
    },
    {
      name: "Payment Requests",
      item: [
        req("List payment requests", "GET", "/payment-requests"),
        req("Create payment request", "POST", "/payment-requests", {
          body: {
            workOrderId: "{{workOrderId}}",
            fieldTicketId: "{{fieldTicketId}}",
            type: "bagro_fee",
            amountRequestedEtb: 185000,
          },
          event: saveId("paymentRequestId", "d.id"),
        }),
        req("Get payment request", "GET", "/payment-requests/{{paymentRequestId}}"),
        req("Update payment request (draft)", "PATCH", "/payment-requests/{{paymentRequestId}}", {
          body: { amountRequestedEtb: 190000 },
        }),
        req("Submit payment request", "POST", "/payment-requests/{{paymentRequestId}}/submit", { body: {} }),
        req("Verify (SPX)", "POST", "/payment-requests/{{paymentRequestId}}/verify", { body: {} }),
        req("Reject payment request", "POST", "/payment-requests/{{paymentRequestId}}/reject", {
          body: { reason: "Amount mismatch" },
        }),
        req("Settle payment request", "POST", "/payment-requests/{{paymentRequestId}}/settle", {
          body: { settlementId: "{{settlementId}}" },
        }),
        req("Payment request history", "GET", "/payment-requests/{{paymentRequestId}}/history"),
      ],
    },
    {
      name: "Owner Settlements",
      item: [
        req("List settlements", "GET", "/owner-settlements"),
        req("Create settlement", "POST", "/owner-settlements", {
          body: {
            workOrderId: "{{workOrderId}}",
            paymentRequestId: "{{paymentRequestId}}",
            type: "bagro_fee",
            payee: "B-Agro Coffee Development PLC",
            amountEtb: 185000,
          },
          event: saveId("settlementId", "d.id"),
        }),
        req("Get settlement", "GET", "/owner-settlements/{{settlementId}}"),
        req("Update settlement (draft)", "PATCH", "/owner-settlements/{{settlementId}}", {
          body: { amountEtb: 185000 },
        }),
        req("Authorize (SPX)", "POST", "/owner-settlements/{{settlementId}}/authorize", { body: {} }),
        req("Mark settled", "POST", "/owner-settlements/{{settlementId}}/mark-settled", { body: {} }),
      ],
    },
    {
      name: "Vendors",
      item: [
        req("List vendors", "GET", "/vendors"),
        req("Get vendor", "GET", "/vendors/{{vendorId}}"),
        req("Create vendor", "POST", "/vendors", {
          body: {
            name: "Highland Harvest Ltd",
            category: "Harvest & Post-Harvest",
            servicesProvided: "Selective picking supervision",
            prequalified: false,
            insuranceOnFile: false,
            insuranceExpiry: null,
            isDefaultExecutionPartner: false,
          },
          event: saveId("vendorId", "d.id"),
        }),
        req("Patch vendor", "PATCH", "/vendors/{{vendorId}}", { body: { prequalified: true } }),
        req("Activate vendor", "POST", "/vendors/{{vendorId}}/activate", { body: {} }),
        req("Deactivate vendor", "POST", "/vendors/{{vendorId}}/deactivate", { body: { status: "terminated" } }),
        req("List vendor users", "GET", "/vendors/{{vendorId}}/users"),
        req("Invite vendor user", "POST", "/vendors/{{vendorId}}/users/invite", {
          body: { email: "picker@bagro.example", role: "vendor_worker" },
        }),
      ],
    },
    {
      name: "Vendor Contracts",
      item: [
        req("List contracts", "GET", "/vendor-contracts"),
        req("Create contract", "POST", "/vendor-contracts", {
          body: {
            vendorId: "{{vendorId}}",
            afeId: "{{afeId}}",
            contractValueUsd: 8000,
            procurementRoute: "sole_source",
            tenderStatus: "n_a",
            contractStart: "2026-03-01",
            contractEnd: "2026-06-30",
          },
          event: saveId("contractId", "d.id"),
        }),
        req("Get contract", "GET", "/vendor-contracts/{{contractId}}"),
        req("Patch contract", "PATCH", "/vendor-contracts/{{contractId}}", { body: { tenderStatus: "awarded" } }),
      ],
    },
    {
      name: "Vendor Scorecards",
      item: [
        req("List scorecards", "GET", "/vendor-scorecards"),
        req("Create scorecard", "POST", "/vendor-scorecards", {
          body: {
            vendorId: "{{vendorId}}",
            reviewPeriod: "Q2 2026",
            qualityScore: 82,
            timelinessScore: 78,
            costAdherenceScore: 80,
            notes: "On track.",
          },
        }),
        req("Get scorecard", "GET", "/vendor-scorecards/{{scorecardId}}"),
        req("Patch scorecard", "PATCH", "/vendor-scorecards/{{scorecardId}}", { body: { qualityScore: 85 } }),
      ],
    },
    {
      name: "Budget vs Actual",
      item: [
        req("List BvA", "GET", "/budget-vs-actual?year=2026"),
        req("BvA summary", "GET", "/budget-vs-actual/summary?year=2026"),
        req("Patch FX config (principal)", "PATCH", "/budget-vs-actual/config", {
          body: { fxRateEtbPerUsd: 57.2 },
        }),
      ],
    },
    {
      name: "Governance",
      item: [
        req("Accountability matrix", "GET", "/accountability-matrix"),
        req("Patch accountability", "PATCH", "/accountability-matrix/Agronomic%20Operations", {
          body: { executeRole: "B-Agro", validateRole: "SPX" },
        }),
        req("Schedule 3 thresholds", "GET", "/schedule3-thresholds"),
        req("Patch Schedule 3 band", "PATCH", "/schedule3-thresholds/A", {
          body: { minValueUsd: 0, maxValueUsd: 5000, effectiveYear: 2026 },
        }),
        req("Schedule 4 insurance", "GET", "/schedule4-insurance"),
        req("Patch Schedule 4", "PATCH", "/schedule4-insurance/{{insuranceRuleId}}", {
          body: { minimumCoverageUsd: 200000 },
        }),
        req("Related-party disclosures", "GET", "/related-party-disclosures"),
        req("Create disclosure", "POST", "/related-party-disclosures", {
          body: { party: "B-Agro", relationship: "Disclosed associate of the Manager", period: "2026", notes: "Schedule 6" },
        }),
        req("Patch disclosure", "PATCH", "/related-party-disclosures/{{disclosureId}}", { body: { notes: "Updated" } }),
      ],
    },
    {
      name: "Revenue Ledger (SPX principal)",
      item: [
        req("List ledger", "GET", "/revenue-ledger"),
        req("Create entry", "POST", "/revenue-ledger", {
          body: {
            period: "2026-02",
            tier: "retainer",
            feeDescription: "Year 1 Main Figure monthly recognition",
            amountUsd: 16250,
            amountEtb: 0,
            invoiceDate: "2026-02-28",
            paymentStatus: "invoiced",
          },
        }),
        req("Get entry", "GET", "/revenue-ledger/{{revenueEntryId}}"),
        req("Patch entry", "PATCH", "/revenue-ledger/{{revenueEntryId}}", { body: { paymentStatus: "paid" } }),
        req("Export entry", "POST", "/revenue-ledger/{{revenueEntryId}}/export", { body: {} }),
      ],
    },
    {
      name: "Reports",
      item: [
        req("List reports", "GET", "/reports"),
        req("Generate weekly", "POST", "/reports/generate/weekly", { body: { periodStart: "2026-01-13" } }),
        req("Generate monthly", "POST", "/reports/generate/monthly", { body: { period: "2026-01" } }),
        req("Generate quarterly", "POST", "/reports/generate/quarterly", { body: { period: "2026-Q1" } }),
        req("Generate annual", "POST", "/reports/generate/annual", { body: { period: "2026" } }),
        req("Get report", "GET", "/reports/{{reportId}}"),
        req("Patch narrative", "PATCH", "/reports/{{reportId}}/narrative", {
          body: { narrative: "SPX monthly narrative for Silva." },
        }),
        req("Release report", "POST", "/reports/{{reportId}}/release", { body: {} }),
      ],
    },
    {
      name: "Notifications",
      item: [
        req("List notifications", "GET", "/notifications?acknowledged=false"),
        req("Acknowledge", "POST", "/notifications/{{notificationId}}/acknowledge", { body: {} }),
      ],
    },
    {
      name: "Audit",
      item: [
        req("List audit log", "GET", "/audit-log"),
        req("Get audit item", "GET", "/audit-log/{{auditId}}"),
      ],
    },
    {
      name: "COA and GL",
      item: [
        req("List COA mapping", "GET", "/coa-mapping"),
        req("Create COA mapping", "POST", "/coa-mapping", {
          body: { sourceAccount: "AFP-pruning", glAccount: "6100-Field Operations", description: "Pruning spend" },
        }),
        req("Patch COA mapping", "PATCH", "/coa-mapping/{{coaMappingId}}", { body: { description: "Updated" } }),
        req("List GL exports", "GET", "/gl-journal-exports"),
        req("Generate GL export", "POST", "/gl-journal-exports/generate", {
          body: { period: "2026-01" },
          event: saveId("glExportId", "d.id"),
        }),
        req("Get GL export (metadata, SPX)", "GET", "/gl-journal-exports/{{glExportId}}"),
        req("Get GL export rows (restricted credential)", "GET", "/gl-journal-exports/{{glExportId}}", {
          description:
            "Uses a `typ=gl_export` JWT (`JWT_GL_EXPORT_SECRET`), not a user access token. Set `glExportToken` in the environment.",
          bearer: "{{glExportToken}}",
        }),
      ],
    },
    {
      name: "Attachments",
      item: [
        req("Get upload URL", "POST", "/attachments/upload-url", {
          body: {
            entityType: "field_ticket",
            entityId: "{{fieldTicketId}}",
            fileName: "blocks-1-2.jpg",
            contentType: "image/jpeg",
            sizeBytes: 240112,
          },
        }),
        req("Register attachment", "POST", "/attachments", {
          body: {
            entityType: "field_ticket",
            entityId: "{{fieldTicketId}}",
            fileName: "blocks-1-2.jpg",
            contentType: "image/jpeg",
            sizeBytes: 240112,
            storageKey: "field_ticket/{{fieldTicketId}}/blocks-1-2.jpg",
          },
        }),
        req("Get attachment", "GET", "/attachments/{{attachmentId}}"),
        req("Delete attachment (draft parent)", "DELETE", "/attachments/{{attachmentId}}"),
      ],
    },
  ],
};

const env = {
  id: "coffee-field-os-local",
  name: "Coffee Field OS — Local",
  _postman_variable_scope: "environment",
  values: [
    { key: "baseUrl", value: "http://localhost:3000/api/v1", enabled: true },
    { key: "accessToken", value: "", enabled: true },
    { key: "refreshToken", value: "", enabled: true },
    { key: "password", value: "Password123!", enabled: true },
    { key: "userId", value: "usr_spx_principal", enabled: true },
    { key: "organizationId", value: "org_spx", enabled: true },
    { key: "vendorId", value: "vnd_bagro", enabled: true },
    { key: "afpLineId", value: "AFP-2026-001", enabled: true },
    { key: "afeId", value: "AFE-0001", enabled: true },
    { key: "workOrderId", value: "WO-0001", enabled: true },
    { key: "assignmentId", value: "woa_01", enabled: true },
    { key: "taskId", value: "", enabled: true },
    { key: "fieldTicketId", value: "", enabled: true },
    { key: "paymentRequestId", value: "", enabled: true },
    { key: "settlementId", value: "", enabled: true },
    { key: "inviteId", value: "", enabled: true },
    { key: "inviteToken", value: "", enabled: true },
    { key: "membershipId", value: "mem_usr_bagro_lead", enabled: true },
    { key: "contractId", value: "", enabled: true },
    { key: "scorecardId", value: "vsc_01", enabled: true },
    { key: "revenueEntryId", value: "INV-0001", enabled: true },
    { key: "reportId", value: "", enabled: true },
    { key: "notificationId", value: "", enabled: true },
    { key: "auditId", value: "", enabled: true },
    { key: "disclosureId", value: "rpd_01", enabled: true },
    { key: "insuranceRuleId", value: "ins_01", enabled: true },
    { key: "coaMappingId", value: "coa_01", enabled: true },
    { key: "glExportId", value: "", enabled: true },
    { key: "attachmentId", value: "", enabled: true },
    { key: "resetToken", value: "", enabled: true },
    { key: "glExportToken", value: "", enabled: true },
  ],
};

const dir = path.join(__dirname, "..", "postman");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "Coffee_Field_OS.postman_collection.json"), JSON.stringify(collection, null, 2));
fs.writeFileSync(path.join(dir, "Coffee_Field_OS.postman_environment.json"), JSON.stringify(env, null, 2));
console.log("Wrote postman collection and environment");
