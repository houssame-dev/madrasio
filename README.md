<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/wordmark-white.png" />
    <img src="apps/web/public/brand/wordmark-colored.png" width="380" alt="Madrasio" />
  </picture>
</p>

<h3 align="center">School management, thoughtfully connected.</h3>

<p align="center">
  A multilingual, multi-tenant school management platform built for the everyday work of private schools.
</p>

<p align="center">
  <a href="https://github.com/houssame-dev/madrasio/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/houssame-dev/madrasio/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/houssame-dev/madrasio/actions/workflows/deploy-staging.yml"><img alt="STAGING deployment" src="https://github.com/houssame-dev/madrasio/actions/workflows/deploy-staging.yml/badge.svg" /></a>
  <img alt="Status: V1 in development" src="https://img.shields.io/badge/status-V1%20in%20development-FCA311" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" />
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#features">Features</a> ·
  <a href="#technology">Technology</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#architecture-and-security">Architecture</a> ·
  <a href="#release-and-deployment">Deployment</a>
</p>

---

## Overview

**Madrasio** is a web-based School Management SaaS that brings academic administration, classroom workflows, parent visibility, and school finance records into one place. It is initially designed around the needs of private schools in Morocco, while maintaining tenant isolation and configurable academic structures suitable for different schools.

The application uses a **modular monolith**: a single Next.js application with explicit domain, application, and infrastructure boundaries, backed by Supabase PostgreSQL and Auth. Schools share the platform but do not share access to each other's data.

Madrasio is **under active V1 development**. The repository contains substantial working application functionality and automated test coverage; this is **not a claim that Production onboarding or all real-school acceptance checks are complete**.

### At a glance

| | |
| --- | --- |
| **Primary users** | School Administrators, Teachers, Parents, and Platform Administrators |
| **Languages** | English (`en`), French (`fr`), Arabic (`ar`) |
| **Layout direction** | LTR for English/French; RTL for Arabic |
| **Themes** | Light, Dark, and System; device-local preference |
| **Platform** | Responsive web application (desktop, tablet, and mobile) |
| **Architecture** | Next.js modular monolith, versioned REST API, PostgreSQL |
| **Current phase** | V1 verification, UX refinement, and release preparation |

## Features

The following capabilities are implemented in the repository. Access and edit permissions depend on the user's role, membership, academic assignments, and resource state.

| Area | Capabilities |
| --- | --- |
| **Identity and schools** | Supabase Auth, login/logout, recovery and invitations, active school membership, school switching, separate platform administration |
| **Academic structure** | Academic years and periods, stages, levels, tracks, subjects, classes, curriculum versions and subject coefficients |
| **Students** | Student records, dated enrollments, transfers, current placement and historical enrollment records |
| **Teachers** | Teacher records, active/historical assignments and assignment-scoped academic access |
| **Parents** | Parent records, parent–student relationships, authorized child overviews and academic history |
| **Timetable** | School/level teaching-week configuration, rooms and labs, per-class subject loads, weekly drafts, conflict checks, published schedules and publication history |
| **Attendance** | Per-published-lesson attendance, teacher-scoped recording and correction, session histories and preserved read-only legacy daily records |
| **Grades** | Grading configurations, gradebooks, assessments and grade entry |
| **Results** | Subject, period and annual calculations, finalization, publication/revisions and parent-visible published results |
| **Homework** | Assignments, targeting, submissions, attachments, reviews and teacher/parent journeys |
| **Announcements** | Authoring, targeting, versions, scheduling, publication, attachments and recipient views |
| **Notifications** | Persisted in-app notifications, unread counts and read state, backed by an outbox workflow |
| **Finance / Tuition** | Fee types and structures, charge generation, balances, adjustments, offline payment recording, allocation history, reversals, receipts and reports |

**Tuition V1 is offline only.** Madrasio records money collected outside the platform (for example, cash, bank transfer or cheque). It does **not** collect tuition through an online payment gateway or process refunds.

**Timetable V1 is deliberately manual.** Administrators build and publish recurring weekly schedules using existing teacher assignments and available rooms; automatic timetable generation, substitution engines, and complex calendar exceptions are not included.

### Roles and access

| Role | Intended experience |
| --- | --- |
| **Platform Administrator** | Platform-level school and administrator management. Platform authority does not automatically grant membership in a school. |
| **School Administrator** | School-scoped academic, staffing, timetable and offline finance management; **Attendance is read-only**. |
| **Teacher** | Assigned classes/subjects, published timetable lessons, authorized lesson attendance, grades, homework and related teaching workflows. |
| **Parent** | Read-only access to their own linked children's eligible school information, including timetable, attendance, homework and published results. |

Students are managed as academic records; **student sign-in accounts are out of scope for V1**. No platform role, client-side control, or URL parameter may bypass server-side school authorization.

## Experience and branding

- **Language:** English, French, and Arabic use shared translation catalogs and locale-aware presentation. Arabic supports RTL layout, including direction-safe date and time display. The V1 language selection is browser/cookie-based; it is not an account-synchronized preference across devices.
- **Theme:** Light / Dark / System, with a preference stored on the current device. The approved palette uses Prussian Blue `#14213d`, Orange `#fca311`, Black `#000000`, Alabaster `#e5e5e5`, White `#ffffff`, and red for destructive actions.
- **Brand:** The official Madrasio colored and white logos/wordmarks are used across the application shell and authentication experience. The repository includes light/dark favicons, an Apple touch icon, and sized app icons under [`apps/web/public/brand/`](apps/web/public/brand/).
- **UI foundations:** Tailwind CSS and shadcn/ui, configured with the **Base UI (`base-nova`)** registry style for new standard components. Existing working controls are retained rather than rewritten solely for a primitive migration.
- **Usability:** Role-aware navigation, responsive layouts, accessible forms, loading/empty/error feedback, keyboard operation, and protected unsaved edits in supported workflows.

## Technology

| Layer | Main technologies |
| --- | --- |
| Application | Next.js 15, React 18, TypeScript |
| UI | Tailwind CSS 3, shadcn/ui (Base UI configuration), Lucide |
| Internationalization | `next-intl` |
| Forms and validation | React Hook Form, Zod |
| Data fetching and state | TanStack Query, Zustand where appropriate |
| Database | PostgreSQL via Supabase, Drizzle ORM and versioned SQL migrations |
| Authentication | Supabase Auth and application-owned school membership/authorization |
| Private files | Cloudflare R2 integration and restricted application file metadata |
| Background operations | PostgreSQL-backed transactional outbox and scheduled jobs |
| Tests | Vitest, Testing Library, Playwright, database/migration and recovery tests |
| Delivery | pnpm workspace, GitHub Actions, Vercel, Supabase |

## Repository layout

```text
madrasio/
├── apps/
│   └── web/                  # Next.js pages, API routes, UI, i18n, tests and operators
├── database/
│   └── drizzle/              # Schema, migrations, snapshots and journal
├── packages/
│   ├── config/               # Shared configuration
│   ├── shared/               # Shared types, utilities and school-time helpers
│   └── ui/                   # Shared UI primitives
├── docs/
│   ├── adr/                  # Architecture Decision Records
│   ├── architecture/         # Design and implementation contracts
│   ├── domain/               # Domain rules and module specifications
│   ├── operations/           # Guarded operator procedures
│   ├── security/             # Security guidance
│   ├── PROJECT-STATE.md      # Milestones and evidence (including historical records)
│   └── CURRENT-TASK-HANDOFF.md
├── .github/workflows/        # CI, scanning, STAGING, Production and backup workflows
├── .env.example              # Configuration template; no real secrets
├── PRD.md                    # Product and engineering requirements
└── package.json              # Workspace scripts
```

The primary web application routes live in `apps/web/app/(app)/`, REST handlers in `apps/web/app/api/v1/`, and feature logic in `apps/web/lib/modules/`.

## Getting started

### Prerequisites

- **Node.js 24** is used in GitHub CI (the repository declares Node.js `>=20`).
- **pnpm 11.22.0**, as specified by the root `packageManager` field; Corepack can manage the version.
- A **development-only** Supabase project or disposable PostgreSQL environment, with the appropriate Supabase Auth configuration.
- Environment-specific credentials for optional private file or background-job workflows, only if testing those integrations.

> **Safety:** Do not use STAGING or Production database credentials for routine local development. Never commit `.env.local`, database URLs, Auth Admin credentials or other secrets.

### Install and configure

From the repository root:

```bash
git clone https://github.com/houssame-dev/madrasio.git
cd madrasio
corepack enable
pnpm install --frozen-lockfile
```

Create the local web environment file from the root template:

```bash
cp .env.example apps/web/.env.local
```

On PowerShell, use `Copy-Item .env.example apps/web/.env.local` instead.

Set the appropriate **development** values in `apps/web/.env.local`. The minimum application settings are:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase publishable key |
| `SUPABASE_URL` | Server-side Supabase project URL |
| `DATABASE_URL` | PostgreSQL runtime connection URL |

Additional variables for Auth Admin, object storage, scheduled jobs, migrations and operator commands are documented in [`.env.example`](.env.example). Server-only values must never be prefixed with `NEXT_PUBLIC_`.

### Run locally

```bash
pnpm dev
```

Open **http://localhost:3000**. Sign-in and school features require a compatible development database, migrations, and separately provisioned test users; cloning the repository alone does not create accounts or seed a school.

Database migrations are **explicit operations**, not part of installation, build or app startup. For an isolated development database only, review the target and connection before invoking `pnpm db:migrate`. Do not run that command with hosted credentials unless an operator-approved migration procedure explicitly authorizes it.

### Verification commands

```bash
pnpm lint          # Repository lint checks
pnpm typecheck     # TypeScript checking
pnpm test          # Workspace unit/integration suites
pnpm build         # Production build
pnpm test:e2e      # Playwright suite (browser prerequisites apply)
```

For targeted web tests, use `pnpm --filter @school/web exec vitest run <test-path>` (with paths relative to `apps/web`). For database migration/recovery and hosted acceptance work, follow the relevant domain and operations documentation rather than reusing an unrestricted local command.

## Architecture and security

Madrasio's **school** is its primary tenant boundary. Authorization is evaluated on the server using authenticated identity, active user and school membership, role permissions, academic assignments, parent–child relationships, and the resource's lifecycle/state.

Important guarantees and design choices:

- **School isolation:** same-school checks and composite foreign keys protect cross-tenant references; application queries and service operations remain explicitly school-scoped.
- **Least privilege:** Teacher access derives from `TeacherAssignment`; Parent visibility derives from active relationships and dated `StudentEnrollment`; frontend visibility is never a substitute for authorization.
- **Historical integrity:** enrollments, curriculum/grading revisions, published timetables/results, payments, and audit events preserve the context needed to explain past records.
- **Session-based attendance:** attendance is recorded against real, applicable published lessons, not arbitrary class/date choices. Older daily entries remain historical, read-only records.
- **Financial correctness:** payment records, charge allocations, reductions, reversals, and receipts retain auditable history; money uses integer minor units.
- **Restricted data access:** sensitive application tables use RLS and restricted API-role grants, together with server-side permissions.
- **Secure operations:** explicit schema migrations, verified TLS connections, isolated hosted environments, guarded background jobs and recovery procedures.

See [architecture overview](docs/architecture/overview.md), [authorization](docs/architecture/authorization.md), [domain rules](docs/domain/business-rules.md), and [Architecture Decision Records](docs/adr/README.md) for authoritative details.

## Release and deployment

| Environment | Policy |
| --- | --- |
| **Local development** | Developer-controlled, non-production credentials; tests and migration experiments on isolated data. |
| **STAGING** | Dedicated Vercel and Supabase resources. Pushes to `main` trigger CI and the guarded STAGING workflow: validation, explicit migration and schema verification, exact-SHA release promotion, deployment and smoke checks. |
| **Production** | Separate environment with a **manual**, exact-commit and approval-gated deployment workflow. Passing CI/STAGING does not authorize Production deployment or real-customer onboarding. |

The [STAGING deployment runbook](docs/architecture/vercel-staging-and-cicd.md), [Production release contract](docs/architecture/production-release-candidate.md), and [backup and recovery guidance](docs/architecture/production-backup-and-recovery.md) describe the operator checks, recovery boundaries and target verification requirements.

**Current status:** The repository's latest verified `main` CI and STAGING deployment workflows succeeded as of **October 23, 2026**. That verifies the committed release pipeline, **not** full authenticated role-by-role acceptance or readiness to onboard customers. Production backup/recovery, account and tenant boundaries, and real-school journeys must be accepted under their own release controls.

### V1 scope boundaries

The immediate goal is a reliable release for real schools, rather than a speculative enterprise suite. The following are **not** part of the current V1 commitment:

- Online tuition gateways, card collection, automatic refunds or a general ledger.
- Automatically generated timetables, substitute-teacher scheduling or complex timetable engines.
- Student login accounts, a native mobile app, or mandatory realtime/WebSocket infrastructure.
- Redis, message brokers or microservices without a demonstrated requirement.

## Documentation

| Document | What it covers |
| --- | --- |
| [`PRD.md`](PRD.md) | Product requirements, engineering principles and source-of-truth hierarchy |
| [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md) | Milestone evidence and historical project state; read dated sections in context |
| [`docs/CURRENT-TASK-HANDOFF.md`](docs/CURRENT-TASK-HANDOFF.md) | Workstream handoffs; verify against current commits and runtime evidence |
| [`docs/domain/timetable-v1.md`](docs/domain/timetable-v1.md) | Timetable configuration, drafts and publication rules |
| [`docs/domain/finance-v1.md`](docs/domain/finance-v1.md) | Fee structures, offline payments, balances, receipts and corrections |
| [`docs/architecture/frontend-attendance.md`](docs/architecture/frontend-attendance.md) | Session-based Attendance UX and authorization boundaries |
| [`docs/architecture/grades-results.md`](docs/architecture/grades-results.md) | Grades and Results rules and lifecycle |
| [`docs/architecture/vercel-staging-and-cicd.md`](docs/architecture/vercel-staging-and-cicd.md) | STAGING pipeline and release gates |
| [`docs/adr/README.md`](docs/adr/README.md) | Accepted architectural decisions and changes |

Several documents retain historical checkpoints intentionally. When they conflict with current source, first determine the document's date and verify the code, accepted ADRs and latest release evidence.

## Contributing and security

Madrasio is actively developed and is not presented here as an open contribution program. Before proposing changes, review [`PRD.md`](PRD.md), relevant domain rules and ADRs. Keep changes scoped, preserve tenant isolation and existing data, and run tests proportionate to risk. Do not commit credentials, private customer information, production dumps, or operator receipts.

Security issues should be disclosed privately to the repository maintainer rather than posted as public issues with exploit details or secrets. See [secret-scanning guidance](docs/security/secret-scanning.md).

## License

This repository currently has **no published `LICENSE` file**. Public repository visibility does not by itself grant permission to copy, modify, or redistribute the software. Contact the maintainer for licensing or commercial-use questions.
