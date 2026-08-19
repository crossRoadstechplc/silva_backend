# SPX Coffee Field OS Implementation Pack

This document is the build guide for delivering a production-ready SPX Coffee Field OS application aligned with the approved project context:

- Silva governs
- SPX manages
- B-Agro is the initial and default execution partner
- The system must support multiple SPX-managed execution vendors over time
- Work Orders remain formal SPX-issued instruments
- Vendors may have invited users with organization-scoped operational roles
- Vendor users may be assigned execution responsibility and internal tasks under Work Orders

This pack includes:

1. Backend PRD
2. Frontend PRD
3. Backend checklist
4. Frontend checklist
5. Stagewise backend execution prompts
6. Stagewise frontend execution prompts
7. QA expectations embedded in every checklist and execution stage

## 1. Product Guardrails

These rules are non-negotiable and must remain true across backend and frontend implementation.

### Structural guardrails

- Every AFE must trace to an AFP line.
- Every Work Order must trace to an approved AFE.
- Every Field Ticket must trace to a Work Order.
- Every Payment Request must trace to a signed-off Field Ticket.
- Owner settlements must remain separate from the SPX Revenue Ledger.
- Delete is disabled for records that have left `draft`.

### Governance guardrails

- Silva never sees SPX fee build-up, cost structure, or margin.
- B-Agro and other vendors never see SPX internal commercial data.
- B-Agro never has a direct system reporting channel to Silva.
- Silva sees only validated summaries and SPX-authored outputs.
- No user may approve their own financial or validation step.
- Sensitive firewalls must be enforced on the server, not only in the UI.

### Vendor expansion guardrails

- The system supports multiple SPX-managed execution vendors.
- B-Agro is the first and default field execution partner.
- Vendor organizations may invite users by email.
- Vendor users are limited to organization-scoped operational roles.
- Work Orders are not casual tasks; tasking exists under Work Orders.

## 2. Recommended Technical Direction

### Core stack

- Frontend: Next.js with TypeScript
- UI: Tailwind CSS and `shadcn/ui`
- State management: TanStack Query and Zustand
- Forms and validation: React Hook Form and Zod
- Backend: NestJS with TypeScript
- Database: PostgreSQL
- ORM: Drizzle ORM or Prisma
- Queue and jobs: BullMQ with Redis
- Object storage: S3-compatible storage
- Authentication: Clerk or custom organization-aware auth

### Architecture style

- Modular monolith
- Clear domain modules
- REST API first
- Server-side authorization
- Database constraints plus service-layer workflow enforcement

## 3. Backend PRD

### 3.1 Objective

Build a secure, auditable, workflow-driven backend that enforces the SPX Coffee Field OS operating chain and permission model while supporting multiple execution vendors and future reporting automation.

### 3.2 Backend responsibilities

- Identity, session, and organization-aware access control
- Workflow state transitions
- Approval routing
- Audit logging
- Notification scheduling and escalation
- Reporting data aggregation
- Vendor and user management
- Special handling for restricted finance and export flows

### 3.3 Domain modules

#### Identity and Access

- Users
- Organizations
- Roles
- Permissions
- Sessions
- Invite flows
- Restricted export credentials

#### Planning and Governance

- AFP
- Accountability Matrix
- Schedule 3 thresholds
- Schedule 4 insurance requirements
- Related party disclosures

#### Execution Chain

- AFEs
- Work Orders
- Vendor assignments
- Work Order tasks
- Field Tickets
- Payment Requests
- Owner Direct Settlements

#### Vendor Management

- Vendors
- Vendor contracts
- Vendor scorecards
- Insurance tracking

#### Finance and Reporting

- Budget vs Actual aggregation
- SPX Revenue Ledger
- COA mapping
- GL Journal Export
- Scheduled report generation

#### Platform Control

- Notifications
- Audit log
- Reporting jobs
- File attachments

### 3.4 Role model

System-level roles:

- `silva_owner`
- `silva_country_manager`
- `silva_finance`
- `spx_principal`
- `spx_account_handler`
- `spx_field_supervisor`
- `system_admin`

Vendor-level operational roles:

- `vendor_admin`
- `vendor_manager`
- `vendor_supervisor`
- `vendor_field_lead`
- `vendor_worker`

Notes:

- B-Agro users are vendor users under the B-Agro organization.
- Vendor roles cannot bypass SPX validation or Silva governance.
- `vendor_admin` may invite and manage vendor users within approved role limits only.

### 3.5 Workflow model

#### AFP

- `draft -> submitted -> approved -> active -> closed`

#### AFE

- `draft -> submitted -> validated -> approved -> active -> closed`

Rules:

- Band A: SPX approves directly within allowed scope
- Band B: SPX issues and Silva is notified with objection window
- Band C/D: Silva approval required before issue

#### Work Order

- `draft -> issued -> in_progress -> complete -> closed`

#### Field Ticket

- `draft -> submitted -> vendor_reviewed -> validated`

#### Payment Request

- `draft -> submitted -> verified -> rejected|settled`

#### Settlement

- `authorized -> settled`

### 3.6 Key backend entities

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

### 3.7 API design principles

- REST endpoints grouped by domain
- Explicit role checks at controller and service level
- Idempotent approval and status actions where possible
- Cursor-safe validation and standardized error shape
- Pagination, filtering, search, sorting on all major list endpoints
- Audit event creation on every sensitive read or write where required

### 3.8 Backend endpoint catalog

The following endpoint list is the minimum production-facing API surface.

#### Auth and session

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`
- `POST /auth/password/forgot`
- `POST /auth/password/reset`

#### Organizations and invites

- `GET /organizations`
- `GET /organizations/:organizationId`
- `POST /organizations`
- `PATCH /organizations/:organizationId`
- `GET /organizations/:organizationId/members`
- `POST /organizations/:organizationId/invites`
- `GET /organizations/:organizationId/invites`
- `POST /invites/:inviteId/accept`
- `POST /invites/:inviteId/revoke`

#### Users and memberships

- `GET /users`
- `GET /users/:userId`
- `POST /users`
- `PATCH /users/:userId`
- `POST /users/:userId/activate`
- `POST /users/:userId/deactivate`
- `PATCH /memberships/:membershipId/role`

#### Dashboard aggregation

- `GET /dashboard/silva-owner`
- `GET /dashboard/spx-management`
- `GET /dashboard/vendor-field`
- `GET /dashboard/notifications`

#### AFP

- `GET /afp-lines`
- `POST /afp-lines`
- `GET /afp-lines/:afpLineId`
- `PATCH /afp-lines/:afpLineId`
- `POST /afp-lines/:afpLineId/submit`
- `POST /afp-lines/:afpLineId/approve`
- `POST /afp-lines/:afpLineId/close`

#### AFE

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

#### Work Orders

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

#### Work Order tasks

- `GET /work-orders/:workOrderId/tasks`
- `POST /work-orders/:workOrderId/tasks`
- `GET /work-order-tasks/:taskId`
- `PATCH /work-order-tasks/:taskId`
- `POST /work-order-tasks/:taskId/start`
- `POST /work-order-tasks/:taskId/complete`
- `POST /work-order-tasks/:taskId/cancel`

#### Field Tickets

- `GET /field-tickets`
- `POST /field-tickets`
- `GET /field-tickets/:fieldTicketId`
- `PATCH /field-tickets/:fieldTicketId`
- `POST /field-tickets/:fieldTicketId/submit`
- `POST /field-tickets/:fieldTicketId/vendor-review`
- `POST /field-tickets/:fieldTicketId/validate`
- `POST /field-tickets/:fieldTicketId/reject`
- `GET /field-tickets/:fieldTicketId/history`

#### Payment Requests

- `GET /payment-requests`
- `POST /payment-requests`
- `GET /payment-requests/:paymentRequestId`
- `PATCH /payment-requests/:paymentRequestId`
- `POST /payment-requests/:paymentRequestId/submit`
- `POST /payment-requests/:paymentRequestId/verify`
- `POST /payment-requests/:paymentRequestId/reject`
- `POST /payment-requests/:paymentRequestId/settle`
- `GET /payment-requests/:paymentRequestId/history`

#### Owner settlements

- `GET /owner-settlements`
- `POST /owner-settlements`
- `GET /owner-settlements/:settlementId`
- `PATCH /owner-settlements/:settlementId`
- `POST /owner-settlements/:settlementId/authorize`
- `POST /owner-settlements/:settlementId/mark-settled`

#### Vendors

- `GET /vendors`
- `POST /vendors`
- `GET /vendors/:vendorId`
- `PATCH /vendors/:vendorId`
- `POST /vendors/:vendorId/activate`
- `POST /vendors/:vendorId/deactivate`
- `GET /vendors/:vendorId/users`
- `POST /vendors/:vendorId/users/invite`

#### Vendor contracts

- `GET /vendor-contracts`
- `POST /vendor-contracts`
- `GET /vendor-contracts/:contractId`
- `PATCH /vendor-contracts/:contractId`

#### Vendor scorecards

- `GET /vendor-scorecards`
- `POST /vendor-scorecards`
- `GET /vendor-scorecards/:scorecardId`
- `PATCH /vendor-scorecards/:scorecardId`

#### Budget vs Actual

- `GET /budget-vs-actual`
- `GET /budget-vs-actual/summary`
- `PATCH /budget-vs-actual/config`

#### Accountability and schedules

- `GET /accountability-matrix`
- `PATCH /accountability-matrix/:operatingDiscipline`
- `GET /schedule3-thresholds`
- `PATCH /schedule3-thresholds/:band`
- `GET /schedule4-insurance`
- `PATCH /schedule4-insurance/:ruleId`

#### Revenue ledger

- `GET /revenue-ledger`
- `POST /revenue-ledger`
- `GET /revenue-ledger/:entryId`
- `PATCH /revenue-ledger/:entryId`
- `POST /revenue-ledger/:entryId/export`

#### Reporting

- `GET /reports`
- `POST /reports/generate/weekly`
- `POST /reports/generate/monthly`
- `POST /reports/generate/quarterly`
- `POST /reports/generate/annual`
- `GET /reports/:reportId`
- `PATCH /reports/:reportId/narrative`
- `POST /reports/:reportId/release`

#### Notifications

- `GET /notifications`
- `POST /notifications/:notificationId/acknowledge`

#### Audit and compliance

- `GET /audit-log`
- `GET /audit-log/:auditId`
- `GET /related-party-disclosures`
- `POST /related-party-disclosures`
- `PATCH /related-party-disclosures/:disclosureId`

#### COA and journal exports

- `GET /coa-mapping`
- `POST /coa-mapping`
- `PATCH /coa-mapping/:mappingId`
- `GET /gl-journal-exports`
- `POST /gl-journal-exports/generate`
- `GET /gl-journal-exports/:exportId`

#### Attachments

- `POST /attachments/upload-url`
- `POST /attachments`
- `GET /attachments/:attachmentId`
- `DELETE /attachments/:attachmentId`

### 3.9 Non-functional backend requirements

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

### 3.10 Backend QA requirements

#### Automated tests

- Unit tests for services, guards, and validators
- Integration tests for all critical workflow transitions
- Permission tests for role-scoped access
- API contract tests for critical endpoints
- Database constraint tests for maker-checker rules
- Job tests for scheduled notifications and report generation

#### Manual QA

- Validate each role’s access boundaries
- Confirm vendor users cannot access other vendors
- Confirm Silva users cannot reach raw field-level vendor detail beyond allowed summaries
- Confirm revenue ledger is inaccessible to non-SPX principal roles
- Confirm Band A/B/C/D logic routes correctly
- Confirm Payment Requests cannot be created before Field Ticket sign-off
- Confirm audit log captures sensitive actions

## 4. Frontend PRD

### 4.1 Objective

Build a role-aware, production-grade web application that presents the SPX Coffee Field OS workflows clearly for Silva, SPX, and vendor users while preserving the platform’s governance model and reducing operational friction.

### 4.2 Frontend responsibilities

- Authentication and session handling
- Dashboard rendering by role
- Workflow forms and approval flows
- Filters, search, and data tables
- Task assignment and execution tracking
- Narrative/report authoring interfaces
- Notifications and escalation visibility
- Responsive, mobile-practical vendor workflows

### 4.3 Primary frontend surfaces

#### Shared platform surfaces

- Login
- Forgot password
- Invite acceptance
- Profile and session state
- Notification center
- Audit-aware activity timeline

#### SPX surfaces

- SPX Management Dashboard
- AFP management
- AFE queue and approvals
- Work Order issuance and task assignment
- Vendor management
- Field Ticket validation queue
- Payment Request verification queue
- Settlement tracking
- Vendor scorecards
- Insurance and tender exceptions
- Monthly and quarterly narrative authoring workspace
- Restricted SPX Revenue Ledger area for principals

#### Silva surfaces

- Silva Owner Dashboard
- AFP review
- AFE approval queue
- Budget vs Actual view
- KPI and progress summaries
- Reports library

#### Vendor surfaces

- Vendor dashboard
- Assigned Work Orders
- Internal task list
- Field Ticket drafting and submission
- Payment Request status tracking
- Own scorecards
- Organization users and invites for allowed vendor admins

### 4.4 UX design direction

- Shared visual language for Silva and SPX on common metrics
- Simpler mobile-first execution layout for vendors
- Strong status visibility for approvals and delays
- Explicit separation of formal artifacts and internal execution tasks
- Every screen must make the next required action obvious

### 4.5 Frontend information architecture

#### Global navigation

- Dashboard
- Planning
- Approvals
- Execution
- Vendors
- Reporting
- Admin

#### Example routing layout

- `/login`
- `/accept-invite`
- `/dashboard`
- `/planning/afp`
- `/planning/afes`
- `/execution/work-orders`
- `/execution/work-orders/:id`
- `/execution/field-tickets`
- `/execution/payment-requests`
- `/vendors`
- `/vendors/:id`
- `/reporting`
- `/reporting/:id`
- `/admin/users`
- `/admin/organizations`
- `/admin/configuration`
- `/finance/revenue-ledger`

### 4.6 Critical screen requirements

#### Dashboard screens

- role-aware cards
- watchlist and exception panels
- aging counters
- pending action queue
- trend and KPI visuals

#### Table screens

- pagination
- filtering
- search
- saved views where useful
- export controls only where authorized

#### Form screens

- inline validation
- draft save support where needed
- role-aware editable states
- clear workflow state display
- approval explanation and audit visibility

#### Work Order detail screen

- AFE linkage
- vendor assignment
- internal task breakdown
- assignees
- status timeline
- attachments
- activity feed

#### Report authoring screen

- draft report data sections
- narrative editor
- release controls
- preview mode
- release history

### 4.7 Frontend state strategy

Use:

- TanStack Query for API state
- Zustand for local cross-screen UI state
- React Hook Form for form flows
- Zod for client validation where appropriate

### 4.8 Frontend component strategy

- reusable table primitives
- reusable status badge system
- approval action bar component
- timeline component
- role gate wrapper
- attachment uploader
- KPI card component
- report section editor
- responsive mobile task card for vendor views

### 4.9 Accessibility and usability requirements

- keyboard navigable core workflows
- semantic labels and landmarks
- high-contrast status indicators
- responsive layouts for field/mobile use
- clear loading, empty, and error states
- confirmation steps for approvals and sensitive actions

### 4.10 Frontend QA requirements

#### Automated tests

- component tests for core UI states
- integration tests for role-based rendering
- end-to-end tests for critical flows:
  - login
  - invite acceptance
  - AFE creation and approval
  - Work Order issue and assignment
  - Field Ticket submit and validate
  - Payment Request verify and settle
  - report authoring and release

#### Manual QA

- validate each dashboard against the permissions spec
- validate mobile usability on vendor execution screens
- verify formal Work Orders remain distinct from internal tasks
- verify users cannot see actions they cannot perform
- verify approval buttons and transitions appear only when valid
- verify all restricted finance screens are hidden and blocked

## 5. Backend Delivery Checklist

### Foundation

- [ ] Initialize NestJS project structure
- [ ] Configure environment management
- [ ] Set up PostgreSQL connection
- [ ] Select and configure ORM
- [ ] Add Redis and BullMQ
- [ ] Configure logging, tracing, and error handling
- [ ] Generate OpenAPI docs

QA:

- [ ] App boots in local, test, and staging environments
- [ ] Health checks pass
- [ ] Lint, format, and typecheck pass

### Identity and access

- [ ] Implement users, organizations, memberships, and invites
- [ ] Implement authentication and sessions
- [ ] Implement role guards and permission policies
- [ ] Implement vendor-scoped invite flow
- [ ] Implement restricted export credential model

QA:

- [ ] Access tests for every role
- [ ] Invite acceptance flow tested
- [ ] Cross-organization access blocked

### Core planning and approvals

- [ ] Implement AFP APIs
- [ ] Implement AFE APIs
- [ ] Implement AFE band computation
- [ ] Implement approval workflows and notifications
- [ ] Implement audit logging for create/update/approve actions

QA:

- [ ] Band A/B/C/D routing tested
- [ ] Silva approval flow tested
- [ ] Audit records verified

### Execution chain

- [ ] Implement Work Orders
- [ ] Implement Work Order assignments
- [ ] Implement Work Order tasks
- [ ] Implement Field Tickets
- [ ] Implement vendor review and SPX validation
- [ ] Implement Payment Requests
- [ ] Implement Settlements

QA:

- [ ] Payment Request blocked before sign-off
- [ ] Maker-checker rules tested
- [ ] Vendor user scoping tested

### Vendor and compliance

- [ ] Implement Vendors
- [ ] Implement contracts and scorecards
- [ ] Implement insurance tracking
- [ ] Implement procurement metadata
- [ ] Implement disclosure records

QA:

- [ ] Insurance expiry alerts tested
- [ ] Vendor role visibility tested
- [ ] Related-party conditions tested

### Reporting and finance

- [ ] Implement Budget vs Actual
- [ ] Implement report generation jobs
- [ ] Implement report authoring API support
- [ ] Implement Revenue Ledger restrictions
- [ ] Implement COA mapping and GL journal export

QA:

- [ ] Revenue firewall tested
- [ ] Report generation outputs validated
- [ ] Export scope restrictions tested

### Production readiness

- [ ] Add monitoring and alerting hooks
- [ ] Add backup and restore strategy
- [ ] Add migration rollback plan
- [ ] Add seed and fixture strategy
- [ ] Add rate limits and secure headers

QA:

- [ ] Load test core endpoints
- [ ] Backup restore rehearsal completed
- [ ] Security review checklist completed

## 6. Frontend Delivery Checklist

### Foundation

- [ ] Initialize Next.js app
- [ ] Configure app shell, routing, theme, and layout system
- [ ] Set up query client, state stores, and form tooling
- [ ] Add design tokens and status system
- [ ] Create shared table, form, modal, and timeline primitives

QA:

- [ ] Build passes
- [ ] Responsive shell tested
- [ ] Design consistency check completed

### Auth and session

- [ ] Build login and session flows
- [ ] Build invite acceptance flow
- [ ] Build unauthorized and forbidden states
- [ ] Build profile and session timeout UX

QA:

- [ ] Session persistence tested
- [ ] Role redirect behavior tested
- [ ] Invite flow tested on desktop and mobile

### Dashboards

- [ ] Build Silva dashboard
- [ ] Build SPX dashboard
- [ ] Build vendor dashboard
- [ ] Build notification center and exception widgets

QA:

- [ ] Dashboard content matches role permissions
- [ ] No restricted metrics leak across roles
- [ ] Mobile vendor dashboard tested

### Planning and approvals

- [ ] Build AFP list/detail/create/edit views
- [ ] Build AFE list/detail/create/edit views
- [ ] Build approval action flows
- [ ] Build status timelines and audit visibility

QA:

- [ ] Approval states render correctly
- [ ] Only authorized roles can act
- [ ] Edge cases for rejected/closed states tested

### Execution flows

- [ ] Build Work Order screens
- [ ] Build assignments and task management UI
- [ ] Build Field Ticket draft and submit flow
- [ ] Build vendor review and SPX validation UX
- [ ] Build Payment Request flow
- [ ] Build Settlement tracking screens

QA:

- [ ] Work Order vs task distinction remains clear
- [ ] Vendor user cannot overreach beyond own scope
- [ ] Mobile task and ticket screens tested

### Vendor and admin flows

- [ ] Build Vendor list/detail screens
- [ ] Build vendor invite and user management screens
- [ ] Build scorecard and contract views
- [ ] Build insurance/compliance screens

QA:

- [ ] Vendor admin actions permission-tested
- [ ] Cross-vendor data isolation tested
- [ ] Compliance warning states tested

### Reporting and finance

- [ ] Build reports library
- [ ] Build narrative authoring workspace
- [ ] Build release controls
- [ ] Build restricted revenue ledger screens
- [ ] Build COA and export admin screens

QA:

- [ ] Report release flow tested
- [ ] Restricted finance views tested by role
- [ ] Export UI visible only where authorized

### Production readiness

- [ ] Add loading, empty, and error states everywhere
- [ ] Add optimistic or guarded invalidation patterns where safe
- [ ] Add end-to-end regression coverage
- [ ] Add accessibility pass

QA:

- [ ] Keyboard navigation tested
- [ ] Lighthouse/performance baseline recorded
- [ ] Visual regression spot check completed

## 7. Stagewise Backend Execution Prompts

These prompts are intended for execution in sequence. Each stage must be completed before moving to the next.

### Backend Stage 1: Foundation

Prompt:

> Build the production-ready backend foundation for SPX Coffee Field OS using NestJS, PostgreSQL, and the selected ORM. Set up modular architecture, environment configuration, structured logging, error handling, OpenAPI, health checks, Redis, and BullMQ. Do not implement business modules yet. Ensure the codebase is ready for secure multi-role workflow development.

QA checklist:

- [ ] App starts locally
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Health endpoint works
- [ ] OpenAPI docs render
- [ ] Test runner is configured

### Backend Stage 2: Identity, organizations, and permissions

Prompt:

> Implement identity and access modules for SPX Coffee Field OS. Add users, organizations, memberships, invited-user flows, login/session handling, role guards, and organization-scoped permissions. Support multiple vendors under SPX management, with B-Agro as the initial default execution vendor. Ensure vendor admins can invite users by email within allowed vendor-scoped operational roles only.

QA checklist:

- [ ] Invite flow works end to end
- [ ] Cross-organization data access blocked
- [ ] Vendor admin cannot assign forbidden roles
- [ ] Silva and vendor roles are isolated correctly
- [ ] Sensitive endpoints reject unauthorized access

### Backend Stage 3: Planning and approval core

Prompt:

> Implement AFP and AFE backend modules, including AFE band computation from Schedule 3 thresholds, approval workflow routing, notifications, and audit logging. Enforce that all AFEs trace to AFP lines and that approval paths differ correctly for Bands A, B, C, and D.

QA checklist:

- [ ] AFP to AFE linkage enforced
- [ ] Band computation tested for edge values
- [ ] Band A/B/C/D transitions tested
- [ ] Audit entries written correctly
- [ ] Unauthorized approval attempts are rejected

### Backend Stage 4: Execution chain

Prompt:

> Implement Work Orders, vendor assignments, internal Work Order tasks, Field Tickets, Payment Requests, and Owner Direct Settlements. Preserve the distinction between formal Work Orders and internal execution tasks. Ensure vendor users can work only inside their organization scope, and enforce maker-checker rules plus SPX validation requirements.

QA checklist:

- [ ] Work Orders require valid AFE linkage
- [ ] Vendor assignments work correctly
- [ ] Tasks stay nested under Work Orders
- [ ] Field Ticket workflow is enforced
- [ ] Payment Request blocked before sign-off
- [ ] Self-approval attempts fail

### Backend Stage 5: Vendors, compliance, and procurement

Prompt:

> Implement Vendors, vendor contracts, scorecards, insurance tracking, and procurement metadata. Support multiple execution vendors while preserving B-Agro’s special default role in the operating model. Add related-party and insurance rules required by the current specs.

QA checklist:

- [ ] Multiple vendors supported
- [ ] B-Agro defaults behave as intended
- [ ] Insurance expiry logic works
- [ ] Vendor scorecard calculations are correct
- [ ] Procurement route constraints are enforced

### Backend Stage 6: Reporting, finance, and restricted exports

Prompt:

> Implement Budget vs Actual aggregation, report generation services, report release workflow support, SPX Revenue Ledger restrictions, COA mapping, and GL Journal Export generation. Ensure Silva-facing outputs always rely on validated data and SPX-authored release workflow. Enforce the revenue firewall and restricted export access model.

QA checklist:

- [ ] Budget vs Actual numbers reconcile
- [ ] Report drafts generate successfully
- [ ] Report release workflow is enforced
- [ ] Revenue Ledger inaccessible to non-SPX principal roles
- [ ] GL export is restricted correctly

### Backend Stage 7: Production hardening

Prompt:

> Harden the backend for production. Add observability hooks, security middleware, rate limiting, backup/restore procedures, migration safety checks, performance tuning for list and dashboard queries, and full regression coverage for core workflows and permissions.

QA checklist:

- [ ] Security checklist completed
- [ ] Load test baseline recorded
- [ ] Backups verified
- [ ] Regression suite green
- [ ] Production config review completed

## 8. Stagewise Frontend Execution Prompts

### Frontend Stage 1: App foundation

Prompt:

> Build the frontend foundation for SPX Coffee Field OS using Next.js, TypeScript, Tailwind, and shadcn/ui. Set up the app shell, routing structure, design tokens, role-aware layout patterns, form and query libraries, and shared UI primitives for tables, timelines, status badges, and action panels.

QA checklist:

- [ ] Build succeeds
- [ ] Core layout responsive
- [ ] Shared components documented by usage
- [ ] Error boundaries and fallback UI work

### Frontend Stage 2: Auth and access UX

Prompt:

> Implement login, session handling, invite acceptance, and role-aware routing for SPX Coffee Field OS. Ensure the UX cleanly separates Silva, SPX, and vendor access patterns, including organization-aware user experiences and correct forbidden-state handling.

QA checklist:

- [ ] Login works
- [ ] Invite acceptance works
- [ ] Invalid role access is blocked visually and functionally
- [ ] Session timeout and refresh behavior tested

### Frontend Stage 3: Dashboards

Prompt:

> Build the three core dashboards for SPX Coffee Field OS: Silva Owner, SPX Management, and Vendor Field. Use a shared status language, clear pending-action sections, and mobile-practical execution views for vendors. Ensure no dashboard exposes data beyond the role’s permitted scope.

QA checklist:

- [ ] Dashboard cards match the specs
- [ ] Exception states render clearly
- [ ] Restricted metrics do not appear to wrong roles
- [ ] Vendor dashboard works on mobile breakpoints

### Frontend Stage 4: Planning and approval workflows

Prompt:

> Implement frontend flows for AFP and AFE management, including create, edit, review, approval, rejection, and history visibility. Make approval states explicit and ensure the interface guides users based on role and current workflow state.

QA checklist:

- [ ] All major workflow states represented
- [ ] Correct buttons appear by role
- [ ] Validation messages are clear
- [ ] Rejected and closed states handled correctly

### Frontend Stage 5: Execution management flows

Prompt:

> Implement Work Order, assignment, internal task, Field Ticket, Payment Request, and Settlement screens. Preserve the distinction between formal Work Orders and internal tasks. Vendor users should be able to execute, submit, and track their own scope only, while SPX users validate and manage approvals.

QA checklist:

- [ ] Work Order details complete and understandable
- [ ] Tasking flows are usable on desktop and mobile
- [ ] Vendor scoping enforced in the UI
- [ ] Validation and settlement states are visible and correct

### Frontend Stage 6: Vendors, reporting, and restricted finance

Prompt:

> Implement vendor management, vendor invite UX, scorecards, compliance screens, report library, narrative authoring workspace, report release controls, and restricted finance views including the SPX Revenue Ledger area. Ensure finance restrictions are reflected in both navigation and page-level access behavior.

QA checklist:

- [ ] Vendor admin flows work
- [ ] Reporting workflow is complete
- [ ] Revenue Ledger hidden from unauthorized roles
- [ ] Authoring and release controls behave correctly

### Frontend Stage 7: Production hardening

Prompt:

> Prepare the frontend for production release. Complete accessibility improvements, end-to-end test coverage for core workflows, empty/loading/error state polish, performance review, and regression validation across Silva, SPX, and vendor user journeys.

QA checklist:

- [ ] Accessibility pass completed
- [ ] E2E regression suite green
- [ ] Performance baseline captured
- [ ] Responsive review completed
- [ ] Release candidate reviewed against the PRD

## 9. Release Readiness Definition

The product is production ready only when all of the following are true:

- Core workflows operate end to end
- Permissions match the approved context
- Firewalls are enforced server side
- Audit logging is reliable and queryable
- Vendor expansion works without breaking the B-Agro-first model
- Reports are generated from validated data only
- Frontend and backend automated tests are stable
- Manual QA signoff is complete for Silva, SPX, and vendor journeys
- Deployment, backup, rollback, and monitoring plans are documented

## 10. Final Build Reminder

Do not drift from the approved base context:

- SPX is the manager and single accountable interface
- Silva is the owner and governance layer
- B-Agro is the initial and default execution partner, not the only possible one
- Multiple vendors are supported under SPX management
- Work Orders are formal instruments, not just tasks
- Vendor user management is allowed only within organization-scoped operational boundaries
