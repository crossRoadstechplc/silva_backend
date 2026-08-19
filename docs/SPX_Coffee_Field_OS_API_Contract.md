# SPX Coffee Field OS — API Payload and Response Contract

This is the shared blueprint for backend and frontend.

- Backend must implement these shapes exactly.
- Frontend must type, mock, and consume these shapes exactly.
- If a field, enum, status, or error code needs to change, both teams update this document first.

Base path: `/api/v1`

---

## 1. Global conventions

### 1.1 Auth

Authenticated requests send:

```http
Authorization: Bearer <accessToken>
```

Optional correlation:

```http
X-Request-Id: <uuid>
```

### 1.2 Content type

```http
Content-Type: application/json
```

Multipart is not used. File uploads use signed URLs from `/attachments/upload-url`.

### 1.3 Success envelope

Single resource:

```json
{
  "data": {}
}
```

Collection:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

Action that returns the updated resource uses the single-resource envelope.

Empty success, only where noted:

```json
{
  "data": {
    "ok": true
  }
}
```

### 1.4 Error envelope

HTTP status carries the class of error. Body is always:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request failed validation.",
    "details": [
      {
        "field": "email",
        "issue": "Invalid email format."
      }
    ]
  },
  "requestId": "req_7c2e1a9f"
}
```

`details` may be `[]`.

Standard codes:

| HTTP | code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid payload or query |
| 400 | `INVALID_STATE` | Workflow transition not allowed |
| 401 | `UNAUTHENTICATED` | Missing or expired token |
| 403 | `FORBIDDEN` | Authenticated but not permitted |
| 404 | `NOT_FOUND` | Resource missing or hidden by scope |
| 409 | `CONFLICT` | Duplicate, stale version, or unique constraint |
| 409 | `MAKER_CHECKER_VIOLATION` | Actor cannot approve own submission |
| 409 | `FIREWALL_VIOLATION` | Cross-org or revenue/IP access blocked |
| 422 | `BUSINESS_RULE_VIOLATION` | Domain rule failed, e.g. PR before ticket sign-off |
| 429 | `RATE_LIMITED` | Auth or export throttled |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### 1.5 List query parameters

Unless an endpoint documents otherwise:

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer | 1 | 1-based |
| `pageSize` | integer | 20 | max 100 |
| `sort` | string | `createdAt` | field name |
| `order` | `asc` \| `desc` | `desc` | |
| `q` | string | | search |
| `status` | string or csv | | resource status |
| `from` | ISO date | | inclusive |
| `to` | ISO date | | inclusive |

### 1.6 Dates, money, IDs

- Timestamps: ISO-8601 UTC, e.g. `2026-03-12T09:14:00.000Z`
- Dates: `YYYY-MM-DD`
- Money: number with 2 decimal places
- Planning money is USD unless noted
- Settlement and payment money is ETB unless noted
- Text IDs preserved from the workbook: `AFP-2026-001`, `AFE-0001`, `WO-0001`, `PR-0001`, `STL-0001`, `INV-0001`
- Other primary keys: UUID strings

### 1.7 Pagination of nested collections

Nested lists such as assignments and tasks return arrays inside `data` without `meta` unless they grow large. If they later need paging, add `meta` without changing item shape.

### 1.8 Idempotency on workflow actions

`submit`, `approve`, `validate`, `verify`, `issue`, `close`, `acknowledge`, `release` are idempotent when the resource is already in the target state. Response is `200` with the current resource. Illegal transitions return `400 INVALID_STATE`.

---

## 2. Shared enumerations

```ts
type OrganizationType = "silva" | "spx" | "vendor";

type SystemRole =
  | "silva_owner"
  | "silva_country_manager"
  | "silva_finance"
  | "spx_principal"
  | "spx_account_handler"
  | "spx_field_supervisor"
  | "system_admin";

type VendorRole =
  | "vendor_admin"
  | "vendor_manager"
  | "vendor_supervisor"
  | "vendor_field_lead"
  | "vendor_worker";

type Role = SystemRole | VendorRole;

type AfeBand = "A" | "B" | "C" | "D";

type AfpStatus = "draft" | "submitted" | "approved" | "active" | "closed";
type AfeStatus = "draft" | "submitted" | "validated" | "approved" | "active" | "closed" | "rejected";
type WorkOrderStatus = "draft" | "issued" | "in_progress" | "complete" | "closed";
type WorkOrderTier = "retainer" | "project" | "special";
type TaskStatus = "draft" | "open" | "in_progress" | "complete" | "cancelled";
type FieldTicketStatus = "draft" | "submitted" | "vendor_reviewed" | "validated" | "rejected";
type PaymentRequestStatus = "draft" | "submitted" | "verified" | "rejected" | "settled";
type PaymentRequestType = "bagro_fee" | "reimbursable_cost" | "vendor_fee";
type SettlementStatus = "draft" | "authorized" | "settled";
type SettlementType = "bagro_fee" | "labor_wages" | "vendor_payment";
type VendorStatus = "active" | "pending" | "expired" | "terminated";
type ProcurementRoute = "sole_source" | "competitive_tender";
type TenderStatus = "n_a" | "in_progress" | "awarded";
type RevenueTier = "retainer" | "project" | "special";
type InvoicePaymentStatus = "invoiced" | "paid" | "overdue";
type HealthStatus = "on_track" | "watch" | "over_budget" | "overdue";
type ReportType = "weekly" | "monthly" | "quarterly" | "annual";
type ReportStatus = "draft" | "in_review" | "released";
type NotificationTrigger =
  | "afe_pending"
  | "insurance_expiring"
  | "budget_watch"
  | "budget_over"
  | "scorecard_low"
  | "ticket_unpaid"
  | "emergency";
type AuditAction = "create" | "update" | "approve" | "reject" | "view_sensitive" | "submit" | "validate" | "verify" | "release";
type InviteStatus = "pending" | "accepted" | "revoked" | "expired";
```

---

## 3. Shared resource schemas

These objects appear in responses. Frontend mock fixtures must use the same keys.

### 3.1 User

```json
{
  "id": "usr_8f3a21c0-2b44-4c91-9d3e-11a0b4d6e8f1",
  "name": "Naomi Tesfaye",
  "email": "naomi@silva.example",
  "role": "silva_country_manager",
  "organizationType": "silva",
  "organizationId": "org_silva",
  "vendorId": null,
  "active": true,
  "createdAt": "2026-01-08T08:00:00.000Z"
}
```

Vendor users set `organizationType` to `"vendor"` and `vendorId` to the vendor UUID.

### 3.2 Organization

```json
{
  "id": "org_bagro",
  "name": "B-Agro Coffee Development PLC",
  "type": "vendor",
  "vendorId": "vnd_bagro",
  "isDefaultExecutionPartner": true,
  "active": true,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

Silva and SPX orgs have `vendorId: null` and `isDefaultExecutionPartner: false`.

### 3.3 Membership

```json
{
  "id": "mem_01",
  "userId": "usr_...",
  "organizationId": "org_bagro",
  "role": "vendor_field_lead",
  "active": true,
  "createdAt": "2026-01-10T00:00:00.000Z"
}
```

### 3.4 Invite

```json
{
  "id": "inv_01",
  "organizationId": "org_bagro",
  "vendorId": "vnd_bagro",
  "email": "supervisor@bagro.example",
  "role": "vendor_supervisor",
  "status": "pending",
  "invitedByUserId": "usr_...",
  "expiresAt": "2026-02-01T00:00:00.000Z",
  "createdAt": "2026-01-18T00:00:00.000Z"
}
```

### 3.5 AFP line

```json
{
  "id": "AFP-2026-001",
  "year": 2026,
  "operatingDiscipline": "Agronomic Operations",
  "activity": "Farm-wide pruning & topping schedule",
  "budgetAllocatedUsd": 42000.00,
  "kpiTarget": "100% of neglected blocks pruned by Q2",
  "status": "approved",
  "silvaApproved": true,
  "approvalDate": "2026-01-05",
  "notes": "Year 1 priority per assessment",
  "createdByUserId": "usr_...",
  "createdAt": "2026-01-02T00:00:00.000Z",
  "updatedAt": "2026-01-05T00:00:00.000Z"
}
```

### 3.6 AFE

```json
{
  "id": "AFE-0001",
  "afpLineId": "AFP-2026-001",
  "operatingDiscipline": "Agronomic Operations",
  "description": "Pruning Blocks 1 to 4",
  "estimatedCostUsd": 4500.00,
  "band": "A",
  "spxValidated": true,
  "silvaApprovalRequired": false,
  "silvaApproved": null,
  "approvalDate": "2026-01-12",
  "status": "active",
  "createdByUserId": "usr_...",
  "createdAt": "2026-01-10T00:00:00.000Z",
  "updatedAt": "2026-01-12T00:00:00.000Z"
}
```

`band` and `silvaApprovalRequired` are computed. Clients must not send them on create/update. Backend ignores them if sent.

Band rules:

- A: `<= 5000`
- B: `5001` to `20000`
- C: `20001` to `50000`
- D: `> 50000`

### 3.7 Work Order

```json
{
  "id": "WO-0001",
  "afeId": "AFE-0001",
  "category": "Agronomic Operations",
  "activity": "Scheduled pruning of Blocks 1 to 4",
  "tier": "retainer",
  "weekStart": 3,
  "weekEnd": 6,
  "spxOversightHoursL1": 4,
  "spxOversightHoursL2": 2,
  "spxOversightHoursL3": 0,
  "assignedVendorId": null,
  "assignedVendorName": "B-Agro Coffee Development PLC",
  "status": "issued",
  "createdAt": "2026-01-13T00:00:00.000Z",
  "updatedAt": "2026-01-13T00:00:00.000Z"
}
```

`assignedVendorId: null` means the default execution partner, B-Agro. Response still includes `assignedVendorName` resolved by the server.

### 3.8 Work Order assignment

```json
{
  "id": "woa_01",
  "workOrderId": "WO-0001",
  "userId": "usr_bagro_lead",
  "roleOnOrder": "vendor_field_lead",
  "isPrimary": true,
  "createdAt": "2026-01-13T10:00:00.000Z"
}
```

### 3.9 Work Order task

```json
{
  "id": "wot_01",
  "workOrderId": "WO-0001",
  "title": "Mark Blocks 1-2 for pruning",
  "description": "Flag trees and confirm labor count.",
  "assigneeUserId": "usr_bagro_worker",
  "status": "open",
  "dueDate": "2026-01-20",
  "createdByUserId": "usr_bagro_lead",
  "createdAt": "2026-01-13T11:00:00.000Z",
  "updatedAt": "2026-01-13T11:00:00.000Z"
}
```

Tasks are internal execution units. They never replace the Work Order.

### 3.10 Field Ticket

```json
{
  "id": "ft_01",
  "workOrderId": "WO-0001",
  "submittedByUserId": "usr_bagro_lead",
  "activityRecorded": "Pruning completed on Blocks 1-2",
  "areaHa": 18.5,
  "laborCount": 24,
  "materialsUsed": "Pruning saws, marking tape",
  "ticketDate": "2026-01-22",
  "signedOff": false,
  "signedOffByUserId": null,
  "signedOffAt": null,
  "status": "submitted",
  "paymentRequestId": null,
  "createdAt": "2026-01-22T16:00:00.000Z",
  "updatedAt": "2026-01-22T16:30:00.000Z"
}
```

### 3.11 Payment Request

```json
{
  "id": "PR-0001",
  "workOrderId": "WO-0001",
  "fieldTicketId": "ft_01",
  "requestedByUserId": "usr_bagro_lead",
  "type": "bagro_fee",
  "amountRequestedEtb": 185000.00,
  "dateSubmitted": "2026-01-24",
  "spxVerified": false,
  "spxVerifiedByUserId": null,
  "verifiedDate": null,
  "status": "submitted",
  "settlementId": null,
  "createdAt": "2026-01-24T08:00:00.000Z",
  "updatedAt": "2026-01-24T08:00:00.000Z"
}
```

Create is rejected unless the linked field ticket has `signedOff: true`.

### 3.12 Owner settlement

```json
{
  "id": "STL-0001",
  "workOrderId": "WO-0001",
  "paymentRequestId": "PR-0001",
  "type": "bagro_fee",
  "payee": "B-Agro Coffee Development PLC",
  "amountEtb": 185000.00,
  "spxAuthorized": true,
  "authorizedByUserId": "usr_spx_handler",
  "dateAuthorized": "2026-01-26",
  "status": "authorized",
  "createdAt": "2026-01-26T09:00:00.000Z",
  "updatedAt": "2026-01-26T09:00:00.000Z"
}
```

Never joined to revenue ledger in any response.

### 3.13 Vendor

```json
{
  "id": "vnd_bagro",
  "organizationId": "org_bagro",
  "name": "B-Agro Coffee Development PLC",
  "category": "Agronomic Operations",
  "servicesProvided": "Agronomy, harvest execution, processing oversight",
  "prequalified": true,
  "insuranceOnFile": true,
  "insuranceExpiry": "2026-12-31",
  "status": "active",
  "isDefaultExecutionPartner": true,
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

### 3.14 Vendor contract

```json
{
  "id": "vct_01",
  "vendorId": "vnd_other",
  "afeId": "AFE-0004",
  "contractValueUsd": 32000.00,
  "procurementRoute": "competitive_tender",
  "tenderStatus": "in_progress",
  "contractStart": "2026-03-01",
  "contractEnd": "2026-06-30"
}
```

### 3.15 Vendor scorecard

```json
{
  "id": "vsc_01",
  "vendorId": "vnd_bagro",
  "reviewPeriod": "Q1 2026",
  "qualityScore": 82,
  "timelinessScore": 78,
  "costAdherenceScore": 80,
  "overallScore": 80,
  "reviewedByUserId": "usr_spx_handler",
  "notes": "On track against Year 1 pruning quality.",
  "createdAt": "2026-04-02T00:00:00.000Z"
}
```

`overallScore` is computed as the average of the three component scores. Clients must not write it.

### 3.16 Revenue ledger entry

Visible only to `spx_principal`.

```json
{
  "id": "INV-0001",
  "period": "2026-01",
  "tier": "retainer",
  "feeDescription": "Year 1 Main Figure monthly recognition",
  "amountEtb": 0,
  "amountUsd": 16250.00,
  "invoiceDate": "2026-01-31",
  "paymentStatus": "invoiced"
}
```

### 3.17 Notification

```json
{
  "id": "ntf_01",
  "triggerType": "afe_pending",
  "entityType": "afe",
  "entityId": "AFE-0003",
  "recipientRole": "silva_owner",
  "message": "AFE-0003 has been pending Silva approval for 6 business days.",
  "sentAt": "2026-02-10T06:00:00.000Z",
  "acknowledged": false
}
```

### 3.18 Audit log

```json
{
  "id": "aud_01",
  "userId": "usr_spx_handler",
  "entityType": "afe",
  "entityId": "AFE-0001",
  "action": "approve",
  "oldValue": { "status": "validated" },
  "newValue": { "status": "approved" },
  "timestamp": "2026-01-12T10:00:00.000Z"
}
```

Immutable. No update or delete endpoints.

### 3.19 Attachment

```json
{
  "id": "att_01",
  "entityType": "field_ticket",
  "entityId": "ft_01",
  "fileName": "blocks-1-2.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 240112,
  "storageKey": "tickets/ft_01/blocks-1-2.jpg",
  "uploadedByUserId": "usr_bagro_lead",
  "createdAt": "2026-01-22T16:05:00.000Z"
}
```

### 3.20 Report

```json
{
  "id": "rpt_2026_01_monthly",
  "type": "monthly",
  "period": "2026-01",
  "status": "draft",
  "generatedAt": "2026-02-01T00:05:00.000Z",
  "narrative": null,
  "releasedAt": null,
  "releasedByUserId": null,
  "visibleToSilva": false
}
```

### 3.21 Workflow comment body

Used on most transition endpoints:

```json
{
  "comment": "Optional note captured in audit history."
}
```

Reject / decline requires:

```json
{
  "reason": "Required explanation."
}
```

---

## 4. Dashboard payloads

Dashboard endpoints return one object, never raw registers that would leak firewall data.

### 4.1 GET `/dashboard/silva-owner`

Query: none required. Optional `year`.

Response `data`:

```json
{
  "year": 2026,
  "afpStatus": {
    "approved": true,
    "activityCompletionPercentByDiscipline": [
      { "operatingDiscipline": "Agronomic Operations", "percent": 42 }
    ]
  },
  "afePipeline": {
    "pendingSilvaApprovalCount": 2,
    "oldestDaysOutstanding": 6,
    "items": [
      {
        "id": "AFE-0003",
        "band": "C",
        "estimatedCostUsd": 32000.00,
        "daysOutstanding": 6,
        "health": "overdue"
      }
    ]
  },
  "budgetVsActual": {
    "lines": [
      {
        "afpLineId": "AFP-2026-001",
        "utilizationPercent": 72,
        "health": "on_track"
      }
    ]
  },
  "harvestKpis": {
    "pickerProductivityCurrent": 38.2,
    "yieldTrendVsBaselinePercent": -4.1
  },
  "vendorPerformance": {
    "belowThresholdCount": 0,
    "summaries": [
      { "vendorId": "vnd_bagro", "name": "B-Agro", "overallScore": 80 }
    ]
  },
  "upcomingActions": [
    { "type": "afe_approval", "entityId": "AFE-0003", "label": "Approve Band C AFE" }
  ],
  "reports": {
    "monthlyReady": false,
    "quarterlyBoardPackActive": false
  }
}
```

Must not include revenue ledger, margin, or raw field tickets.

### 4.2 GET `/dashboard/spx-management`

Includes Silva dashboard fields plus:

```json
{
  "silva": { },
  "revenueLedgerSummary": {
    "invoicedUsd": 16250.00,
    "paidUsd": 0,
    "overdueCount": 0,
    "yearToDateUsd": 16250.00
  },
  "fieldTicketQueue": {
    "awaitingSignOffCount": 4
  },
  "exceptions": [
    {
      "triggerType": "insurance_expiring",
      "entityId": "vnd_other",
      "health": "watch",
      "message": "Insurance expires in 12 days."
    }
  ],
  "reportWorkspace": {
    "monthlyDraftId": "rpt_2026_01_monthly",
    "monthlyStatus": "draft"
  }
}
```

`revenueLedgerSummary` is omitted or null unless the caller is `spx_principal`. Other SPX roles still get the rest of the dashboard.

### 4.3 GET `/dashboard/vendor-field`

Scoped to the caller's vendor.

```json
{
  "assignedWorkOrders": {
    "currentCount": 3,
    "upcomingCount": 1
  },
  "myTasks": {
    "openCount": 5,
    "dueTodayCount": 2
  },
  "fieldTickets": {
    "draftCount": 1,
    "awaitingValidationCount": 2
  },
  "paymentRequests": {
    "pendingCount": 1,
    "verifiedCount": 0
  },
  "ownScorecard": {
    "reviewPeriod": "Q1 2026",
    "overallScore": 80
  }
}
```

Must not include other vendors, SPX fees, or Silva full budget totals.

### 4.4 GET `/dashboard/notifications`

Same collection envelope as `/notifications`, filtered to the current user/role.

---

## 5. Endpoint catalog

Unless noted, all endpoints except login, refresh, password, and invite accept require a valid access token.

---

### 5.1 Auth and session

#### POST `/auth/login`

Request:

```json
{
  "email": "naomi@silva.example",
  "password": "********"
}
```

Response `201`/`200`:

```json
{
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresIn": 3600,
    "user": { }
  }
}
```

Errors: `401 UNAUTHENTICATED`, `429 RATE_LIMITED`.

#### POST `/auth/logout`

Request: empty object `{}`.

Response:

```json
{ "data": { "ok": true } }
```

#### POST `/auth/refresh`

Request:

```json
{ "refreshToken": "eyJ..." }
```

Response: same shape as login, without requiring a new password.

#### GET `/auth/me`

Response:

```json
{
  "data": {
    "user": { },
    "memberships": [ ],
    "permissions": ["afp.read", "afe.approve_band_c"]
  }
}
```

#### POST `/auth/password/forgot`

Request:

```json
{ "email": "naomi@silva.example" }
```

Response always `{ "data": { "ok": true } }` to avoid email enumeration.

#### POST `/auth/password/reset`

Request:

```json
{
  "token": "reset_...",
  "password": "********"
}
```

Response: `{ "data": { "ok": true } }`.

---

### 5.2 Organizations and invites

#### GET `/organizations`

Query: standard list params plus `type`.

Response: collection of Organization.

Vendor users only see their own organization.

#### GET `/organizations/:organizationId`

Response: single Organization.

#### POST `/organizations`

SPX principal / system admin only.

Request:

```json
{
  "name": "Highland Harvest Ltd",
  "type": "vendor",
  "isDefaultExecutionPartner": false
}
```

If `type` is `vendor`, backend also creates the Vendor record. Default execution partner can be true for only one vendor.

Response `201`: Organization.

#### PATCH `/organizations/:organizationId`

Request: partial `{ "name", "active" }`.

Cannot change `type`. Changing `isDefaultExecutionPartner` is SPX principal only.

#### GET `/organizations/:organizationId/members`

Response: collection of Membership joined with public user fields:

```json
{
  "id": "mem_01",
  "role": "vendor_supervisor",
  "active": true,
  "user": {
    "id": "usr_...",
    "name": "Dawit Bekele",
    "email": "dawit@bagro.example",
    "role": "vendor_supervisor",
    "active": true
  }
}
```

#### POST `/organizations/:organizationId/invites`

Request:

```json
{
  "email": "worker@bagro.example",
  "role": "vendor_worker"
}
```

Vendor admin may only invite `VendorRole` values into their own vendor org.

Response `201`: Invite.

Errors: `403 FORBIDDEN`, `409 CONFLICT` if pending invite exists.

#### GET `/organizations/:organizationId/invites`

Query: `status`.

Response: collection of Invite.

#### POST `/invites/:inviteId/accept`

May be unauthenticated if token in body.

Request:

```json
{
  "token": "invite_...",
  "name": "Sara Hailu",
  "password": "********"
}
```

Response: same as login (`user` + tokens).

#### POST `/invites/:inviteId/revoke`

Request: `{}`.

Response: Invite with `status: "revoked"`.

---

### 5.3 Users and memberships

#### GET `/users`

SPX admin/principal and scoped vendor admin.

Query: `role`, `organizationId`, `vendorId`, `active`.

Response: collection of User. Vendor admin sees only own vendor users.

#### GET `/users/:userId`

Response: User. `403`/`404` if out of scope.

#### POST `/users`

SPX system admin / principal. Prefer invites for vendors.

Request:

```json
{
  "name": "Omar",
  "email": "omar@spx.example",
  "role": "spx_principal",
  "organizationId": "org_spx",
  "password": "********"
}
```

Response `201`: User. Never returns password.

#### PATCH `/users/:userId`

Request: `{ "name", "email" }`. Role changes go through memberships.

#### POST `/users/:userId/activate`

Request: `{}`. Response: User with `active: true`.

#### POST `/users/:userId/deactivate`

Request: `{}`. Response: User with `active: false`.

#### PATCH `/memberships/:membershipId/role`

Request:

```json
{ "role": "vendor_supervisor" }
```

Vendor admin cannot assign SystemRole values.

Response: Membership.

---

### 5.4 AFP

#### GET `/afp-lines`

Query: `year`, `status`, `operatingDiscipline`.

Vendor responses omit `budgetAllocatedUsd` or set it `null`. Silva and SPX see budget figures.

#### POST `/afp-lines`

SPX principal / account handler.

Request:

```json
{
  "year": 2026,
  "operatingDiscipline": "Agronomic Operations",
  "activity": "Soil sampling & nutrition program launch",
  "budgetAllocatedUsd": 18000.00,
  "kpiTarget": "Soil tested on 100% of blocks",
  "notes": null
}
```

Response `201`: AFP line in `draft`. ID assigned by server (`AFP-YYYY-NNN`).

#### GET `/afp-lines/:afpLineId`

Response: AFP line.

#### PATCH `/afp-lines/:afpLineId`

Allowed only in `draft`. Request: any writable create fields.

#### POST `/afp-lines/:afpLineId/submit`

Request: workflow comment body.

Response: AFP line `submitted`.

#### POST `/afp-lines/:afpLineId/approve`

Silva owner / country manager.

Request: workflow comment body.

Response: AFP line `approved` with `silvaApproved: true` and `approvalDate`.

#### POST `/afp-lines/:afpLineId/close`

SPX principal. Request: workflow comment body.

Response: AFP line `closed`.

---

### 5.5 AFE

#### GET `/afes`

Query: `status`, `band`, `afpLineId`, `silvaApprovalRequired`.

Vendor users may only originate via create-request; they do not receive the full register. If called by vendor, return `403 FORBIDDEN`.

#### POST `/afes`

Request:

```json
{
  "afpLineId": "AFP-2026-001",
  "operatingDiscipline": "Agronomic Operations",
  "description": "Washing station inspection and minor rehabilitation",
  "estimatedCostUsd": 32000.00
}
```

Response `201`: AFE with computed `band` and `silvaApprovalRequired`.

Vendor create is stored as `draft` and treated as an origin request, not register access.

#### GET `/afes/:afeId`

Response: AFE.

#### PATCH `/afes/:afeId`

Allowed in `draft` only. Cannot set `band`.

#### POST `/afes/:afeId/submit`

Moves `draft -> submitted`.

#### POST `/afes/:afeId/validate`

SPX account handler or principal. Moves `submitted -> validated`.

Band A may then auto-advance to `approved`.
Band B becomes `approved` with Silva notification pending objection window.
Band C/D stay `validated` until Silva approve.

#### POST `/afes/:afeId/approve`

Silva for Band C/D. SPX for Band A/B as documented.

Request: workflow comment body.

#### POST `/afes/:afeId/reject`

Request: `{ "reason": "..." }`.

Response: AFE `rejected`.

#### POST `/afes/:afeId/close`

Request: workflow comment body.

Response: AFE `closed`.

#### GET `/afes/:afeId/history`

Response: collection of Audit log items for that entity, no `meta` if short, or standard collection.

---

### 5.6 Work Orders

#### GET `/work-orders`

Query: `status`, `afeId`, `assignedVendorId`, `tier`.

Vendor users only receive their assigned work orders.

#### POST `/work-orders`

SPX only. Request:

```json
{
  "afeId": "AFE-0001",
  "category": "Agronomic Operations",
  "activity": "Scheduled pruning of Blocks 1 to 4",
  "tier": "retainer",
  "weekStart": 3,
  "weekEnd": 6,
  "spxOversightHoursL1": 4,
  "spxOversightHoursL2": 2,
  "spxOversightHoursL3": 0,
  "assignedVendorId": null
}
```

AFE must be `approved` or `active`. Response `201`: Work Order `draft`.

#### GET `/work-orders/:workOrderId`

Response: Work Order plus optional embedded summary:

```json
{
  "data": {
    "...workOrder": true,
    "assignmentCount": 2,
    "openTaskCount": 3,
    "fieldTicketCount": 1
  }
}
```

Keep extra summary fields at the same level as the work order fields listed in 3.7.

#### PATCH `/work-orders/:workOrderId`

Draft only, same writable fields as create.

#### POST `/work-orders/:workOrderId/issue`

`draft -> issued`. Request: comment body.

#### POST `/work-orders/:workOrderId/start`

`issued -> in_progress`.

#### POST `/work-orders/:workOrderId/complete`

`in_progress -> complete`.

#### POST `/work-orders/:workOrderId/close`

`complete -> closed`.

#### GET `/work-orders/:workOrderId/assignments`

Response: `{ "data": [ assignment ] }`.

#### POST `/work-orders/:workOrderId/assignments`

Request:

```json
{
  "userId": "usr_bagro_lead",
  "roleOnOrder": "vendor_field_lead",
  "isPrimary": true
}
```

Assignee must belong to the assigned vendor org.

Response `201`: assignment.

#### PATCH `/work-orders/:workOrderId/assignments/:assignmentId`

Request: `{ "isPrimary", "roleOnOrder" }` or `{ "active": false }` to unassign.

---

### 5.7 Work Order tasks

#### GET `/work-orders/:workOrderId/tasks`

Response: `{ "data": [ task ] }`.

#### POST `/work-orders/:workOrderId/tasks`

Vendor manager/lead/supervisor or SPX.

Request:

```json
{
  "title": "Mobilize 24 laborers",
  "description": "Confirm attendance by 06:00.",
  "assigneeUserId": "usr_bagro_worker",
  "dueDate": "2026-01-21"
}
```

Response `201`: task `open`.

#### GET `/work-order-tasks/:taskId`

Response: task.

#### PATCH `/work-order-tasks/:taskId`

Request: `{ "title", "description", "assigneeUserId", "dueDate" }`.

Not allowed when `complete` or `cancelled`.

#### POST `/work-order-tasks/:taskId/start`

`open -> in_progress`.

#### POST `/work-order-tasks/:taskId/complete`

`in_progress -> complete`.

#### POST `/work-order-tasks/:taskId/cancel`

`open|in_progress -> cancelled`. Request: `{ "reason": "..." }`.

---

### 5.8 Field Tickets

#### GET `/field-tickets`

Query: `status`, `workOrderId`.

Silva does not receive raw tickets. Silva callers get `403 FIREWALL_VIOLATION`.
Vendor callers only own-org tickets.
SPX receives validation queue items.

#### POST `/field-tickets`

Vendor field lead / worker.

Request:

```json
{
  "workOrderId": "WO-0001",
  "activityRecorded": "Pruning completed on Blocks 1-2",
  "areaHa": 18.5,
  "laborCount": 24,
  "materialsUsed": "Pruning saws, marking tape",
  "ticketDate": "2026-01-22"
}
```

Response `201`: ticket `draft`. `submittedByUserId` is the caller.

#### GET `/field-tickets/:fieldTicketId`

Response: Field Ticket.

#### PATCH `/field-tickets/:fieldTicketId`

Draft only. Same writable fields as create except `workOrderId`.

#### POST `/field-tickets/:fieldTicketId/submit`

`draft -> submitted`. Submitter cannot be the later validator.

#### POST `/field-tickets/:fieldTicketId/vendor-review`

Vendor supervisor. `submitted -> vendor_reviewed`.

`MAKER_CHECKER_VIOLATION` if reviewer is the submitter.

#### POST `/field-tickets/:fieldTicketId/validate`

SPX field supervisor / account handler.

Request: comment body.

Sets `signedOff: true`, `signedOffByUserId`, `signedOffAt`, status `validated`.
Validator organization must be `spx` and must not equal submitter.

#### POST `/field-tickets/:fieldTicketId/reject`

Request: `{ "reason": "..." }`. Status `rejected`.

#### GET `/field-tickets/:fieldTicketId/history`

Audit collection.

---

### 5.9 Payment Requests

#### GET `/payment-requests`

Query: `status`, `workOrderId`, `type`.

Silva may read verified/settled summaries, not draft vendor notes.
Vendor sees own submissions only.

#### POST `/payment-requests`

Request:

```json
{
  "workOrderId": "WO-0001",
  "fieldTicketId": "ft_01",
  "type": "bagro_fee",
  "amountRequestedEtb": 185000.00
}
```

`422 BUSINESS_RULE_VIOLATION` if ticket `signedOff` is not true.

Response `201`: Payment Request `draft`.

#### GET `/payment-requests/:paymentRequestId`

Response: Payment Request.

#### PATCH `/payment-requests/:paymentRequestId`

Draft only. Writable: `type`, `amountRequestedEtb`.

#### POST `/payment-requests/:paymentRequestId/submit`

`draft -> submitted`. Sets `dateSubmitted`.

#### POST `/payment-requests/:paymentRequestId/verify`

SPX account handler or principal. Not the requester. Different organization required.

Sets `spxVerified: true`, `spxVerifiedByUserId`, `verifiedDate`, status `verified`.

#### POST `/payment-requests/:paymentRequestId/reject`

Request: `{ "reason": "..." }`. Status `rejected`.

#### POST `/payment-requests/:paymentRequestId/settle`

Used after owner settlement is marked settled, or as a terminal flag. Sets status `settled` and `settlementId` if provided:

```json
{ "settlementId": "STL-0001" }
```

#### GET `/payment-requests/:paymentRequestId/history`

Audit collection.

---

### 5.10 Owner settlements

#### GET `/owner-settlements`

Query: `status`, `workOrderId`, `type`.

Vendor sees own payee settlements only.
Must never include revenue ledger fields.

#### POST `/owner-settlements`

SPX. Request:

```json
{
  "workOrderId": "WO-0001",
  "paymentRequestId": "PR-0001",
  "type": "bagro_fee",
  "payee": "B-Agro Coffee Development PLC",
  "amountEtb": 185000.00
}
```

Payment request must be `verified`. Response `201` settlement `draft`.

#### GET `/owner-settlements/:settlementId`

Response: settlement.

#### PATCH `/owner-settlements/:settlementId`

Draft only. Writable: `payee`, `amountEtb`, `type`.

#### POST `/owner-settlements/:settlementId/authorize`

SPX. Sets `spxAuthorized: true`, `authorizedByUserId`, `dateAuthorized`, status `authorized`.
Authorizer cannot be the payment requester.

#### POST `/owner-settlements/:settlementId/mark-settled`

SPX or Silva finance. Status `settled`.

---

### 5.11 Vendors

#### GET `/vendors`

SPX and Silva (read). Vendors do not list other vendors (`403`).

#### POST `/vendors`

SPX. Prefer creating via organization+vendor. If used directly:

```json
{
  "name": "Highland Harvest Ltd",
  "category": "Harvest & Post-Harvest",
  "servicesProvided": "Selective picking supervision",
  "prequalified": false,
  "insuranceOnFile": false,
  "insuranceExpiry": null,
  "isDefaultExecutionPartner": false
}
```

Only one default execution partner allowed.

#### GET `/vendors/:vendorId`

Vendor users may read only their own vendor.

#### PATCH `/vendors/:vendorId`

SPX. Partial vendor fields. Cannot flip default partner without principal.

#### POST `/vendors/:vendorId/activate`

Status `active`.

#### POST `/vendors/:vendorId/deactivate`

Status `terminated` or `expired` via:

```json
{ "status": "terminated" }
```

#### GET `/vendors/:vendorId/users`

Same scoping as organization members for that vendor org.

#### POST `/vendors/:vendorId/users/invite`

Same body as organization invite. Convenience alias. Response: Invite.

---

### 5.12 Vendor contracts

#### GET `/vendor-contracts`

Query: `vendorId`, `afeId`, `tenderStatus`.

Vendors cannot list others' contracts.

#### POST `/vendor-contracts`

SPX. Request matches schema 3.14 without `id`.

Contracts above 10000 USD require `procurementRoute: "competitive_tender"` except B-Agro related-party exemption.

#### GET `/vendor-contracts/:contractId`

Response: contract.

#### PATCH `/vendor-contracts/:contractId`

Partial writable fields.

---

### 5.13 Vendor scorecards

#### GET `/vendor-scorecards`

Query: `vendorId`, `reviewPeriod`.

Vendor sees own scores only.

#### POST `/vendor-scorecards`

SPX. Request:

```json
{
  "vendorId": "vnd_bagro",
  "reviewPeriod": "Q1 2026",
  "qualityScore": 82,
  "timelinessScore": 78,
  "costAdherenceScore": 80,
  "notes": "On track."
}
```

Response includes computed `overallScore`.

#### GET `/vendor-scorecards/:scorecardId`

Response: scorecard.

#### PATCH `/vendor-scorecards/:scorecardId`

SPX. Component scores only. `overallScore` recomputed.

---

### 5.14 Budget vs Actual

#### GET `/budget-vs-actual`

Query: `year`.

Response:

```json
{
  "data": [
    {
      "afpLineId": "AFP-2026-001",
      "activity": "Farm-wide pruning & topping schedule",
      "budgetAllocatedUsd": 42000.00,
      "committedUsd": 4500.00,
      "actualUsd": 30240.00,
      "utilizationPercent": 72,
      "health": "on_track"
    }
  ],
  "meta": { "page": 1, "pageSize": 50, "total": 8, "totalPages": 1 }
}
```

Vendors: `403`.
FX conversion uses the single config rate.

#### GET `/budget-vs-actual/summary`

```json
{
  "data": {
    "year": 2026,
    "totalBudgetUsd": 180000.00,
    "totalActualUsd": 96400.00,
    "watchCount": 1,
    "overBudgetCount": 0,
    "fxRateEtbPerUsd": 57.2
  }
}
```

#### PATCH `/budget-vs-actual/config`

SPX principal.

```json
{ "fxRateEtbPerUsd": 57.2 }
```

Response: same as summary config fields.

---

### 5.15 Accountability and schedules

#### GET `/accountability-matrix`

Response collection of:

```json
{
  "operatingDiscipline": "Agronomic Operations",
  "executeRole": "B-Agro",
  "validateRole": "SPX",
  "decideRole": "SPX",
  "authorRole": "SPX",
  "schedule3Ref": "AFE Bands A-C"
}
```

#### PATCH `/accountability-matrix/:operatingDiscipline`

SPX principal. Partial role fields. `operatingDiscipline` is URL-encoded name.

#### GET `/schedule3-thresholds`

```json
{
  "data": [
    {
      "band": "A",
      "minValueUsd": 0,
      "maxValueUsd": 5000,
      "spxAuthority": "Decide and issue AFE directly within approved AFP budget",
      "silvaAuthority": "Informed in the monthly report",
      "effectiveYear": 2026
    }
  ]
}
```

Band D `maxValueUsd` is `null`.

#### PATCH `/schedule3-thresholds/:band`

SPX principal. Request: `{ "minValueUsd", "maxValueUsd", "spxAuthority", "silvaAuthority", "effectiveYear" }`.

#### GET `/schedule4-insurance`

Collection of:

```json
{
  "id": "ins_01",
  "party": "B-Agro (Execution Contractor)",
  "coverageType": "Employer's liability",
  "minimumCoverageUsd": 200000,
  "beneficiary": "Silva named as additional insured"
}
```

#### PATCH `/schedule4-insurance/:ruleId`

SPX principal. Partial fields.

---

### 5.16 Revenue ledger

All endpoints: `spx_principal` only. Any other role: `403 FIREWALL_VIOLATION`.

#### GET `/revenue-ledger`

Query: `period`, `tier`, `paymentStatus`.

Collection of ledger entries.

#### POST `/revenue-ledger`

Request:

```json
{
  "period": "2026-01",
  "tier": "retainer",
  "feeDescription": "Year 1 Main Figure monthly recognition",
  "amountUsd": 16250.00,
  "amountEtb": 0,
  "invoiceDate": "2026-01-31",
  "paymentStatus": "invoiced"
}
```

#### GET `/revenue-ledger/:entryId`

Single entry.

#### PATCH `/revenue-ledger/:entryId`

Partial writable fields. Not joinable to settlements.

#### POST `/revenue-ledger/:entryId/export`

Response:

```json
{
  "data": {
    "exportId": "rlex_01",
    "downloadUrl": "https://files.example/restricted/...",
    "expiresAt": "2026-02-01T12:00:00.000Z"
  }
}
```

---

### 5.17 Reporting

#### GET `/reports`

Query: `type`, `status`, `period`.

Silva only sees `released` and `visibleToSilva: true`.

#### POST `/reports/generate/weekly`

SPX. Request optional `{ "periodStart": "2026-01-13" }`.

Response `201`: Report `draft`.

#### POST `/reports/generate/monthly`

Same pattern. Period `YYYY-MM`.

#### POST `/reports/generate/quarterly`

Same. Only valid while Enhanced Governance is active; otherwise `422`.

#### POST `/reports/generate/annual`

Same. AFP draft for coming year.

#### GET `/reports/:reportId`

Silva cannot fetch drafts. Response: Report plus:

```json
{
  "sections": [
    { "key": "budget_vs_actual", "title": "Budget vs Actual", "payload": {} }
  ]
}
```

`sections` are generated data. They are not free-form.

#### PATCH `/reports/:reportId/narrative`

SPX.

```json
{ "narrative": "Markdown or plain text authored by SPX." }
```

Does not release the report.

#### POST `/reports/:reportId/release`

SPX principal or account handler after principal review, per product rule: explicit release.

Sets `status: "released"`, `visibleToSilva: true`, `releasedAt`, `releasedByUserId`.

Draft with empty narrative: `422 BUSINESS_RULE_VIOLATION`.

---

### 5.18 Notifications

#### GET `/notifications`

Query: `acknowledged`, `triggerType`.

Collection scoped to current user/role.

#### POST `/notifications/:notificationId/acknowledge`

Request: `{}`.

Response: notification with `acknowledged: true`.

---

### 5.19 Audit and compliance

#### GET `/audit-log`

SPX principal / system admin. Silva may request export via this read if permitted as "on request".

Query: `entityType`, `entityId`, `userId`, `action`, `from`, `to`.

Collection of audit items. No update/delete.

#### GET `/audit-log/:auditId`

Single audit item.

#### GET `/related-party-disclosures`

Collection:

```json
{
  "id": "rpd_01",
  "party": "B-Agro",
  "relationship": "Disclosed associate of the Manager",
  "period": "2026",
  "notes": "Schedule 6 disclosure",
  "createdAt": "2026-01-05T00:00:00.000Z"
}
```

Vendors: `403`.

#### POST `/related-party-disclosures`

SPX. Request: `{ "party", "relationship", "period", "notes" }`.

#### PATCH `/related-party-disclosures/:disclosureId`

SPX. Partial fields.

---

### 5.20 COA and GL journal exports

#### GET `/coa-mapping`

SPX finance-capable roles. Silva finance: no access per roles spec (`No access` for Silva Owner on COA). Silva finance TBD: treat as read-only if later confirmed. Default: SPX only.

Item:

```json
{
  "id": "coa_01",
  "sourceAccount": "AFP-pruning",
  "glAccount": "6100-Field Operations",
  "description": "Pruning program spend"
}
```

#### POST `/coa-mapping`

Request: `{ "sourceAccount", "glAccount", "description" }`.

#### PATCH `/coa-mapping/:mappingId`

Partial fields.

#### GET `/gl-journal-exports`

SPX create/read. Silva designated accountant uses restricted export credential, not a normal Silva owner login.

Item:

```json
{
  "id": "glx_01",
  "period": "2026-01",
  "status": "ready",
  "createdAt": "2026-02-01T00:00:00.000Z",
  "restrictedAccessTokenIssued": true
}
```

Does not embed operating tables.

#### POST `/gl-journal-exports/generate`

SPX.

```json
{ "period": "2026-01" }
```

Response `201`: export metadata. File is denormalized and isolated.

#### GET `/gl-journal-exports/:exportId`

Normal SPX session returns metadata.

Restricted credential session returns:

```json
{
  "data": {
    "id": "glx_01",
    "period": "2026-01",
    "rows": [
      {
        "date": "2026-01-26",
        "account": "6100-Field Operations",
        "debitEtb": 185000.00,
        "creditEtb": 0,
        "memo": "STL-0001 B-Agro fee"
      }
    ]
  }
}
```

Restricted credential calling any other endpoint: `403 FIREWALL_VIOLATION`.

---

### 5.21 Attachments

#### POST `/attachments/upload-url`

Request:

```json
{
  "entityType": "field_ticket",
  "entityId": "ft_01",
  "fileName": "blocks-1-2.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 240112
}
```

Response:

```json
{
  "data": {
    "uploadUrl": "https://s3.example/...",
    "storageKey": "tickets/ft_01/blocks-1-2.jpg",
    "expiresAt": "2026-01-22T16:15:00.000Z"
  }
}
```

#### POST `/attachments`

Called after successful upload.

```json
{
  "entityType": "field_ticket",
  "entityId": "ft_01",
  "fileName": "blocks-1-2.jpg",
  "contentType": "image/jpeg",
  "sizeBytes": 240112,
  "storageKey": "tickets/ft_01/blocks-1-2.jpg"
}
```

Response `201`: Attachment.

Draft-only delete rule: attachments on non-draft parents cannot be deleted; `400 INVALID_STATE`.

#### GET `/attachments/:attachmentId`

Response: Attachment plus `downloadUrl` and `expiresAt`.

#### DELETE `/attachments/:attachmentId`

Only if parent is `draft`. Response `{ "data": { "ok": true } }`.

---

## 6. Permission snapshot for implementers

| Area | Silva | SPX handler | SPX principal | Vendor |
| --- | --- | --- | --- | --- |
| AFP | read, approve | read, create/update draft | full except Silva approve | summary, no budget |
| AFE register | read, approve C/D | create, validate, approve A/B | full | originate request only |
| Work orders | read | create, issue | full | own WOs + tasks |
| Field tickets | no raw list | validate | validate | own create/review |
| Payment requests | read verified | verify | verify | own create |
| Settlements | read | authorize instruction | authorize | own status |
| Revenue ledger | none | none | full | none |
| Reports | released only | draft + narrative | release | none |
| Other vendors | read summary | manage | manage | none |

---

## 7. Frontend mock requirements

Frontend Phase 0 must ship fixtures that:

1. Use these schemas with no extra required fields and no renamed keys.
2. Cover the full operating chain on one happy path:

`AFP-2026-001 -> AFE-0001 -> WO-0001 -> ft_01 -> PR-0001 -> STL-0001`

3. Include negative fixtures:
   - Band C AFE waiting Silva (`AFE-0003`)
   - payment request create against unsigned ticket (API returns 422)
   - second vendor user cannot see B-Agro work orders
   - non-principal calling `/revenue-ledger` returns 403
   - Silva calling `/field-tickets` returns 403
4. Support role switcher identities listed in the frontend checklist.
5. Serve the same envelope (`data` / `meta` / `error`) as production.

When the real backend is connected, only the base URL and auth tokens change.

---

## 8. Change control

Both teams treat this file as the contract.

Allowed without a contract change:

- additional optional response fields that clients may ignore
- extra query filters that clients may ignore

Not allowed without a contract change:

- renaming fields
- changing enums
- changing workflow states
- changing error codes
- making a currently optional field required
- joining revenue ledger into any other response
