# SPX Coffee Field OS Frontend PRD

## Purpose

This document defines the production-ready frontend requirements for SPX Coffee Field OS. It is aligned to the approved operating context and preserves the formal workflow distinction between governance artifacts and execution tasks.

## Product guardrails

- Silva, SPX, and vendor users must see different role-scoped experiences.
- Shared metrics between Silva and SPX should use the same visual grammar.
- Vendor views must be simpler and more mobile-practical.
- Work Orders remain formal SPX-issued instruments.
- Internal vendor tasks sit under Work Orders and must not replace them.
- Restricted data must be hidden and inaccessible in the UI, but never treated as UI-only security.

## Technical direction

- Framework: Next.js with TypeScript
- Styling: Tailwind CSS
- Component system: `shadcn/ui`
- State: TanStack Query and Zustand
- Forms: React Hook Form
- Validation: Zod
- Testing: component, integration, and end-to-end coverage

## Objective

Build a role-aware, production-grade web application that presents SPX Coffee Field OS workflows clearly for Silva, SPX, and vendor users while preserving the platform’s governance model and reducing operational friction.

## Frontend responsibilities

- Authentication and session handling
- Dashboard rendering by role
- Workflow forms and approval flows
- Filters, search, and data tables
- Task assignment and execution tracking
- Narrative and report authoring interfaces
- Notifications and escalation visibility
- Responsive, mobile-practical vendor workflows

## Primary frontend surfaces

### Shared platform surfaces

- Login
- Forgot password
- Invite acceptance
- Profile and session state
- Notification center
- Activity and timeline views

### SPX surfaces

- SPX Management Dashboard
- AFP management
- AFE queue and approvals
- Work Order issuance and task assignment
- Vendor management
- Field Ticket validation queue
- Payment Request verification queue
- Settlement tracking
- Vendor scorecards
- Insurance and tender exception views
- Narrative authoring workspace
- Restricted SPX Revenue Ledger area for principals

### Silva surfaces

- Silva Owner Dashboard
- AFP review
- AFE approval queue
- Budget vs Actual view
- KPI and progress summaries
- Reports library

### Vendor surfaces

- Vendor dashboard
- Assigned Work Orders
- Internal task list
- Field Ticket drafting and submission
- Payment Request status tracking
- Own scorecards
- Organization users and invites for allowed vendor admins

## UX design direction

- Shared visual language for Silva and SPX dashboards on common metrics
- Simpler mobile-first execution layout for vendors
- Strong visibility for pending approvals and bottlenecks
- Explicit separation of formal records and internal execution tasks
- Every screen should make the next valid action obvious

## Information architecture

### Global navigation

- Dashboard
- Planning
- Approvals
- Execution
- Vendors
- Reporting
- Admin

### Suggested routing layout

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

## Critical screen requirements

### Dashboard screens

- Role-aware KPI cards
- Watchlist and exception panels
- Aging counters
- Pending action queues
- KPI trend visuals

### Table screens

- Pagination
- Filtering
- Search
- Saved views where useful
- Export actions only where authorized

### Form screens

- Inline validation
- Draft save support where needed
- Role-aware editable states
- Clear workflow state display
- Approval explanation and history visibility

### Work Order detail screen

- AFE linkage
- Vendor assignment
- Internal task breakdown
- Assignees
- Status timeline
- Attachments
- Activity feed

### Report authoring screen

- Draft report sections sourced from live backend data
- Narrative editor
- Preview mode
- Release controls
- Release history

## Frontend state strategy

- Use TanStack Query for API-backed server state
- Use Zustand for lightweight client UI state
- Use React Hook Form for forms
- Use Zod for validation and type-safe form parsing

## Component strategy

- Reusable data table primitives
- Shared status badge system
- Approval action bar
- Timeline component
- Role gate wrapper
- Attachment uploader
- KPI card set
- Report section editor
- Mobile task card for vendor execution

## Accessibility and usability requirements

- Keyboard navigable core workflows
- Semantic labels and landmarks
- High-contrast status indicators
- Responsive layouts, especially for vendor views
- Clear loading, empty, and error states
- Confirmation steps for approvals and other sensitive actions

## Frontend QA requirements

### Automated tests

- Component tests for core UI states
- Integration tests for role-based rendering
- End-to-end tests for critical flows:
  - login
  - invite acceptance
  - AFE creation and approval
  - Work Order issue and assignment
  - Field Ticket submit and validate
  - Payment Request verify and settle
  - report authoring and release

### Manual QA

- Validate each dashboard against the permissions spec
- Validate mobile usability on vendor execution screens
- Verify Work Orders remain distinct from internal tasks
- Verify users cannot see actions they cannot perform
- Verify approval actions appear only when valid
- Verify restricted finance screens are hidden from unauthorized roles

## Production-ready exit criteria

- Dashboards match approved role visibility
- Workflow screens support end-to-end journeys
- Vendor mobile flows are practical and responsive
- Frontend state behavior is predictable and recoverable
- End-to-end regression coverage is stable
- Accessibility review is complete
- Error, empty, and loading states are complete
- Restricted finance and approval UI rules are validated
