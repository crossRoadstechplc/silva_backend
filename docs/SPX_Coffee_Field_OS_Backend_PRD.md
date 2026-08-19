# SPX Coffee Field OS Backend PRD

## Purpose

This document defines the production-ready backend requirements for SPX Coffee Field OS. It is aligned to the approved project context:

- Silva governs
- SPX manages
- B-Agro is the initial and default execution partner
- Multiple SPX-managed execution vendors must be supported
- Work Orders remain formal SPX-issued instruments
- Vendor users may exist only within organization-scoped operational roles

## Product guardrails

### Structural

- Every AFE must trace to an AFP line.
- Every Work Order must trace to an approved AFE.
- Every Field Ticket must trace to a Work Order.
- Every Payment Request must trace to a signed-off Field Ticket.
- Owner settlements must remain structurally separate from the SPX Revenue Ledger.
- Records that leave `draft` cannot be deleted.

### Governance

- Silva must never see SPX fee build-up, cost structure, or margin.
- Vendors must never see SPX internal commercial data.
- Vendors must not have a direct Silva reporting path.
- Silva sees only validated summaries and SPX-authored outputs.
- No user may approve their own financial or validation step.
- Security boundaries must be enforced on the server.

## Technical direction

- Backend framework: NestJS with TypeScript
- Database: PostgreSQL
- ORM: Drizzle ORM or Prisma
- Queue/jobs: BullMQ with Redis
- Storage: S3-compatible object storage
- Auth: Clerk or custom organization-aware auth
- Architecture style: modular monolith
- API style: REST-first with OpenAPI

## Objective

Build a secure, auditable, workflow-driven backend that enforces the SPX Coffee Field OS operating chain, role model, and reporting controls while supporting multiple execution vendors and future reporting automation.

## Backend responsibilities

- Identity and organization-aware access control
- Workflow state transitions
- Approval routing
- Audit logging
- Notification scheduling and escalation
- Reporting data aggregation
- Vendor and user management
- Special handling for restricted finance and export flows

## Domain modules

### Identity and Access

- Users
- Organizations
- Roles
- Permissions
- Sessions
- Invite flows
- Restricted export credentials

### Planning and Governance

- AFP
- Accountability Matrix
- Schedule 3 thresholds
- Schedule 4 insurance requirements
- Related party disclosures

### Execution Chain

- AFEs
- Work Orders
- Vendor assignments
- Work Order tasks
- Field Tickets
- Payment Requests
- Owner Direct Settlements

### Vendor Management

- Vendors
- Vendor contracts
- Vendor scorecards
- Insurance tracking

### Finance and Reporting

- Budget vs Actual aggregation
- SPX Revenue Ledger
- COA mapping
- GL Journal Export
- Scheduled report generation

### Platform Control

- Notifications
- Audit log
- Reporting jobs
- File attachments

## Role model

### System roles

- `silva_owner`
- `silva_country_manager`
- `silva_finance`
- `spx_principal`
- `spx_account_handler`
- `spx_field_supervisor`
- `system_admin`

### Vendor operational roles

- `vendor_admin`
- `vendor_manager`
- `vendor_supervisor`
- `vendor_field_lead`
- `vendor_worker`

### Role notes

- B-Agro users are vendor users under the B-Agro organization.
- Vendor admins may invite and manage vendor users only within approved vendor roles.
- Vendor roles cannot bypass SPX validation, AFE governance, or Silva approval rules.

## Workflow model

### AFP

`draft -> submitted -> approved -> active -> closed`

### AFE

`draft -> submitted -> validated -> approved -> active -> closed`

Rules:

- Band A: SPX approves directly within allowed scope
- Band B: SPX issues and Silva is notified with objection window
- Band C/D: Silva approval required before issue

### Work Order

`draft -> issued -> in_progress -> complete -> closed`

### Field Ticket

`draft -> submitted -> vendor_reviewed -> validated`

### Payment Request

`draft -> submitted -> verified -> rejected|settled`

### Settlement

`authorized -> settled`

## Key backend entities

- `users`
- `organizations`
- `organization_memberships`
- `invites`
- `afp_lines`
- `afes`
- `work_orders`
- `work_order_assignments`
- `work_order_tasks`
- `field_tickets`
- `payment_requests`
- `owner_settlements`
- `vendors`
- `vendor_contracts`
- `vendor_scorecards`
- `spx_revenue_ledger`
- `schedule3_thresholds`
- `schedule4_insurance`
- `accountability_matrix`
- `notifications`
- `audit_log`
- `attachments`
- `related_party_disclosures`
- `coa_mapping`
- `gl_journal_exports`

## API design principles

- REST endpoints grouped by domain
- Explicit role checks at controller and service level
- Idempotent approval and status actions where possible
- Standardized validation and error shape
- Pagination, filtering, search, and sorting on major list endpoints
- Audit event creation on every sensitive read or write where required

## Endpoint catalog

### Auth and session

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/password/forgot`
- `POST /auth/password/reset`

### Organizations and invites

- `GET /organizations`
- `GET /organizations/:organizationId`
- `POST /organizations`
- `PATCH /organizations/:organizationId`
- `GET /organizations/:organizationId/members`
- `POST /organizations/:organizationId/invites`
- `GET /organizations/:organizationId/invites`
- `POST /invites/:inviteId/accept`
- `POST /invites/:inviteId/revoke`

### Users and memberships

- `GET /users`
- `GET /users/:userId`
- `POST /users`
- `PATCH /users/:userId`
- `POST /users/:userId/activate`
- `POST /users/:userId/deactivate`
- `PATCH /memberships/:membershipId/role`

### Dashboard aggregation

- `GET /dashboard/silva-owner`
- `GET /dashboard/spx-management`
- `GET /dashboard/vendor-field`
- `GET /dashboard/notifications`

### AFP

- `GET /afp-lines`
- `POST /afp-lines`
- `GET /afp-lines/:afpLineId`
- `PATCH /afp-lines/:afpLineId`
- `POST /afp-lines/:afpLineId/submit`
- `POST /afp-lines/:afpLineId/approve`
- `POST /afp-lines/:afpLineId/close`

### AFE

- `GET /afes`
- `POST /afes`
- `GET /afes/:afeId`
- `PATCH /afes/:afeId`
- `POST /afes/:afeId/submit`
- `POST /afes/:afeId/validate`
- `POST /afes/:afeId/approve`
- `POST /afes/:afeId/reject`
- `POST /afes/:afeId/close`
- `GET /afes/:afeId/history`

### Work Orders

- `GET /work-orders`
- `POST /work-orders`
- `GET /work-orders/:workOrderId`
- `PATCH /work-orders/:workOrderId`
- `POST /work-orders/:workOrderId/issue`
- `POST /work-orders/:workOrderId/start`
- `POST /work-orders/:workOrderId/complete`
- `POST /work-orders/:workOrderId/close`
- `GET /work-orders/:workOrderId/assignments`
- `POST /work-orders/:workOrderId/assignments`
- `PATCH /work-orders/:workOrderId/assignments/:assignmentId`

### Work Order tasks

- `GET /work-orders/:workOrderId/tasks`
- `POST /work-orders/:workOrderId/tasks`
- `GET /work-order-tasks/:taskId`
- `PATCH /work-order-tasks/:taskId`
- `POST /work-order-tasks/:taskId/start`
- `POST /work-order-tasks/:taskId/complete`
- `POST /work-order-tasks/:taskId/cancel`

### Field Tickets

- `GET /field-tickets`
- `POST /field-tickets`
- `GET /field-tickets/:fieldTicketId`
- `PATCH /field-tickets/:fieldTicketId`
- `POST /field-tickets/:fieldTicketId/submit`
- `POST /field-tickets/:fieldTicketId/vendor-review`
- `POST /field-tickets/:fieldTicketId/validate`
- `POST /field-tickets/:fieldTicketId/reject`
- `GET /field-tickets/:fieldTicketId/history`

### Payment Requests

- `GET /payment-requests`
- `POST /payment-requests`
- `GET /payment-requests/:paymentRequestId`
- `PATCH /payment-requests/:paymentRequestId`
- `POST /payment-requests/:paymentRequestId/submit`
- `POST /payment-requests/:paymentRequestId/verify`
- `POST /payment-requests/:paymentRequestId/reject`
- `POST /payment-requests/:paymentRequestId/settle`
- `GET /payment-requests/:paymentRequestId/history`

### Owner settlements

- `GET /owner-settlements`
- `POST /owner-settlements`
- `GET /owner-settlements/:settlementId`
- `PATCH /owner-settlements/:settlementId`
- `POST /owner-settlements/:settlementId/authorize`
- `POST /owner-settlements/:settlementId/mark-settled`

### Vendors

- `GET /vendors`
- `POST /vendors`
- `GET /vendors/:vendorId`
- `PATCH /vendors/:vendorId`
- `POST /vendors/:vendorId/activate`
- `POST /vendors/:vendorId/deactivate`
- `GET /vendors/:vendorId/users`
- `POST /vendors/:vendorId/users/invite`

### Vendor contracts

- `GET /vendor-contracts`
- `POST /vendor-contracts`
- `GET /vendor-contracts/:contractId`
- `PATCH /vendor-contracts/:contractId`

### Vendor scorecards

- `GET /vendor-scorecards`
- `POST /vendor-scorecards`
- `GET /vendor-scorecards/:scorecardId`
- `PATCH /vendor-scorecards/:scorecardId`

### Budget vs Actual

- `GET /budget-vs-actual`
- `GET /budget-vs-actual/summary`
- `PATCH /budget-vs-actual/config`

### Accountability and schedules

- `GET /accountability-matrix`
- `PATCH /accountability-matrix/:operatingDiscipline`
- `GET /schedule3-thresholds`
- `PATCH /schedule3-thresholds/:band`
- `GET /schedule4-insurance`
- `PATCH /schedule4-insurance/:ruleId`

### Revenue ledger

- `GET /revenue-ledger`
- `POST /revenue-ledger`
- `GET /revenue-ledger/:entryId`
- `PATCH /revenue-ledger/:entryId`
- `POST /revenue-ledger/:entryId/export`

### Reporting

- `GET /reports`
- `POST /reports/generate/weekly`
- `POST /reports/generate/monthly`
- `POST /reports/generate/quarterly`
- `POST /reports/generate/annual`
- `GET /reports/:reportId`
- `PATCH /reports/:reportId/narrative`
- `POST /reports/:reportId/release`

### Notifications

- `GET /notifications`
- `POST /notifications/:notificationId/acknowledge`

### Audit and compliance

- `GET /audit-log`
- `GET /audit-log/:auditId`
- `GET /related-party-disclosures`
- `POST /related-party-disclosures`
- `PATCH /related-party-disclosures/:disclosureId`

### COA and journal exports

- `GET /coa-mapping`
- `POST /coa-mapping`
- `PATCH /coa-mapping/:mappingId`
- `GET /gl-journal-exports`
- `POST /gl-journal-exports/generate`
- `GET /gl-journal-exports/:exportId`

### Attachments

- `POST /attachments/upload-url`
- `POST /attachments`
- `GET /attachments/:attachmentId`
- `DELETE /attachments/:attachmentId`

## Non-functional requirements

- Centralized error handling
- Structured logging
- Database migration strategy
- Seed strategy for local and staging
- Background jobs for reports and alerts
- Request correlation IDs
- Rate limiting on auth and export endpoints
- Environment-based configuration
- Health checks and readiness endpoints
- API versioning
- OpenAPI documentation

## Backend QA requirements

### Automated tests

- Unit tests for services, guards, and validators
- Integration tests for critical workflow transitions
- Permission tests for role-scoped access
- API contract tests for critical endpoints
- Database constraint tests for maker-checker rules
- Job tests for scheduled notifications and report generation

### Manual QA

- Validate each role’s access boundaries
- Confirm vendor users cannot access other vendors
- Confirm Silva users cannot reach raw field-level vendor detail beyond allowed summaries
- Confirm revenue ledger is inaccessible to non-SPX principal roles
- Confirm Band A/B/C/D logic routes correctly
- Confirm Payment Requests cannot be created before Field Ticket sign-off
- Confirm audit log captures sensitive actions

## Production-ready exit criteria

- Core workflows operate end to end
- Permissions match approved context
- Firewalls are enforced server side
- Audit logging is reliable and queryable
- Vendor expansion works without breaking the B-Agro-first model
- Reports are generated from validated data only
- Automated backend tests are stable
- Manual QA signoff is complete
- Deployment, backup, rollback, and monitoring plans are documented
