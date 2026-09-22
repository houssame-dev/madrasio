# Madrasio

> A modern, multilingual, multi-tenant school management SaaS designed for private schools.

[![Status](https://img.shields.io/badge/status-in%20development-yellow)](https://github.com/)
[![License](https://img.shields.io/badge/license-TBD-lightgrey)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-Framework-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791?logo=postgresql)](https://www.postgresql.org/)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F)](https://orm.drizzle.team/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend%20Services-3ECF8E?logo=supabase)](https://supabase.com/)

---

## Overview

**Madrasio** is a school management platform built for private schools that need a reliable and modern way to manage their academic, administrative, and communication workflows from a single system.

The platform is designed around a **modular monolith architecture**, with strong domain boundaries, multi-tenant isolation, role-based authorization, historical academic integrity, and a web-first experience that can support future mobile clients.

The initial target is **private schools in Morocco**, with support for:

- Arabic
- French
- English
- RTL / LTR interfaces

The system is being designed as a long-term SaaS product rather than a collection of isolated CRUD screens.

---

## Product Goals

The platform aims to provide schools with a unified system for:

- Managing students, teachers, and parents
- Organizing academic years, periods, levels, tracks, subjects, curricula, and classes
- Managing assessments, grades, and academic results
- Tracking attendance
- Managing homework and submissions
- Publishing school announcements
- Delivering in-app notifications
- Preserving historical academic information
- Enforcing secure, school-scoped access

The project prioritizes **correctness, maintainability, security, and simplicity** over premature complexity.

---

## Core Users

### Super Admin

Platform-level administration and management.

### School Admin

Manages school data, academic structure, users, classes, grades, attendance, homework, announcements, and related operations within the school.

### Teacher

Works within their assigned academic scope and can manage the academic/communication operations permitted to them.

### Parent

Can access information related to their own children, including:

- Grades
- Attendance
- Homework
- Announcements
- Notifications

### Student

> Student accounts are intentionally **out of scope for V1**.

Students exist as academic entities and are managed through the school/parent/teacher workflows.

---

## V1 Modules

The V1 product is organized around the following functional modules:

| # | Module | Purpose |
|---|---|---|
| 01 | Authentication | Identity, sessions, account access |
| 02 | Schools | School and membership management |
| 03 | Students | Student records and academic enrollment |
| 04 | Teachers | Teacher records and academic assignments |
| 05 | Parents | Parent records and parent-student relationships |
| 06 | Academic Structure | Academic years, periods, stages, levels, tracks, curricula |
| 07 | Subjects | Subject management |
| 08 | Classes | Academic classes and class lifecycle |
| 09 | Grades | Gradebooks, assessments, grades, and results |
| 10 | Attendance | Student attendance tracking |
| 11 | Homework | Homework, targeting, submissions, and review |
| 12 | Announcements | Rich-text announcements, targeting, revisions, and publication |
| 13 | Notifications | In-app notifications and unread/read state |

> Authentication and platform services may be grouped differently at implementation level; the table reflects the product capabilities defined during planning.

---

## Key Domain Principles

The system is built around a few important domain decisions.

### Academic history is first-class

Historical academic data must remain correct even when the current state changes.

For example:

```text
Student
  └── StudentEnrollment
          ├── Class A
          └── Class B
```

A student transferring to another class must not rewrite their previous academic history.

### Teacher scope comes from assignments

Teacher access is determined by:

> TeacherAssignment

Assignments define the relevant:

- Class
- Subject
- Academic context

### Parent scope comes from relationships and enrollment

Parent access is determined using:

> ParentStudent + StudentEnrollment

A parent must never gain access to another student's data simply because both students belong to the same class or school.

### Subject coefficients are contextual

A subject does not own one universal coefficient.

Instead:

```text
CurriculumVersion
      +
Subject
      +
Coefficient
      ↓
CurriculumSubject
```

This allows the same subject to have different coefficients in different academic contexts.

### Period results are not annual results

The system explicitly separates:

> PeriodResult

from:

> AnnualResult

Historical results must remain stable even when current academic configuration changes.

### Homework is not automatically a grade

Homework and Grades are separate domains.

Any integration between them must be explicit.

---

## Architecture

The V1 system uses a **Modular Monolith** architecture.

```text
                         ┌─────────────────────┐
                         │   Web / Mobile      │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │      Next.js        │
                         │                     │
                         │ UI                  │
                         │ Server Components   │
                         │ Route Handlers      │
                         │ Server Actions      │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Application Layer   │
                         │                     │
                         │ Use Cases           │
                         │ Policies            │
                         │ Queries             │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    Domain Layer     │
                         │                     │
                         │ Students            │
                         │ Teachers            │
                         │ Grades              │
                         │ Attendance          │
                         │ Homework            │
                         │ Announcements       │
                         │ Notifications       │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Drizzle ORM         │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Supabase PostgreSQL │
                         └─────────────────────┘

                    Supporting Infrastructure
                    ┌──────────┬──────────────┐
                    │          │              │
                    ▼          ▼              ▼
                 Supabase    Cloudflare      GitHub
                   Auth          R2          Actions
```

The architecture intentionally avoids microservices and unnecessary infrastructure in V1.

---

## Security & Multi-Tenancy

Security is enforced server-side.

The authorization model follows:

```text
Authentication
      ↓
Active User
      ↓
School Membership
      ↓
School Context
      ↓
Role
      ↓
Permission
      ↓
Scope
      ↓
Ownership / Relationship
      ↓
Resource State
      ↓
ALLOW / DENY
```

### Tenant isolation

A school is the primary tenant boundary.

A user operating within School A must never be able to access School B data through:

- direct resource IDs
- query parameters
- URL manipulation
- bulk operations
- client-side state
- cached data

Frontend permission checks are treated as a UX mechanism only. Backend authorization is always authoritative.

---

## Technology Stack

| Concern | Technology |
|---|---|
| Application | Next.js, React, TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Data & State | TanStack Query, Zustand |
| Forms & Validation | React Hook Form, Zod |
| Database | Supabase, PostgreSQL |
| ORM | Drizzle ORM |
| Authentication | Supabase Auth |
| File Storage | Cloudflare R2 |
| Testing | Vitest, Testing Library, Playwright |
| Tooling | pnpm, GitHub Actions |

---

## Repository Structure

The repository is organized around domain modules and shared platform capabilities.

```text
madrasio/
│
├── apps/
│   └── web/
│
├── packages/
│   ├── ui/
│   ├── shared/
│   └── config/
│
├── database/
│   └── drizzle/
│
├── docs/
│   ├── product/
│   ├── domain/
│   ├── architecture/
│   ├── adr/
│   └── development/
│
├── scripts/
│
├── .github/
│   └── workflows/
│
├── PRD.md
├── README.md
└── package.json
```

The detailed technical structure is documented separately and should not be inferred solely from the README.

---

## Development Philosophy

The project follows a few strict principles:

### Keep V1 simple

Do not introduce infrastructure because it may be useful someday.

Redis, BullMQ, WebSockets, microservices, Kafka, Kubernetes, and similar technologies are deliberately deferred until real requirements justify them.

### Domain before implementation

Business rules are defined before database/API/UI implementation.

### Server-side security

The client is never trusted for authorization.

### Historical integrity

Current state must never silently rewrite historical academic truth.

### Explicit boundaries

Modules own their business logic and data.

Cross-module direct writes are prohibited.

### Test by risk

More testing effort is allocated to:

- Authorization
- Tenant isolation
- Grade calculations
- Enrollment
- Historical integrity
- Announcement targeting
- Notification idempotency

---

## Development Status

### Current phase

**Architecture & Implementation Blueprint — Complete**

| Area | Status |
|---|---|
| Product Design | ✅ |
| Domain Model | ✅ |
| Global System Review | ✅ |
| Permissions | ✅ |
| Architecture | ✅ |
| Tech Stack | ✅ |
| Implementation Blueprint | ✅ |
| Definition of Done | ✅ |

### Next phase

> Project Bootstrap

The next implementation step is to create the runnable Next.js foundation and configure:

- Next.js
- TypeScript
- pnpm
- Tailwind CSS
- shadcn/ui
- Supabase
- Drizzle
- Testing
- Environment Configuration
- CI

No business module will be implemented until the foundation passes its initial verification checkpoint.

---

## Documentation

Project documentation will be maintained under:

```text
docs/
├── product/
├── domain/
├── architecture/
├── adr/
└── development/
```

Important architectural decisions are recorded as ADRs (Architecture Decision Records).

The authoritative project instructions for AI (ex:Codex ...) are stored in:

> `PRD.md`

---

## Development Workflow

The project is being developed incrementally.

```text
Foundation
    ↓
Authentication
    ↓
Schools & Membership
    ↓
Academic Structure
    ↓
Students / Teachers / Parents
    ↓
Grades
    ↓
Attendance
    ↓
Homework
    ↓
Announcements
    ↓
Notifications
    ↓
Hardening
    ↓
Production Readiness
```

Each milestone must satisfy its Definition of Done before the next milestone begins.

### STAGING release

STAGING uses a dedicated Vercel project and Supabase project. GitHub Actions is
the only deployment authority: it validates and builds the exact `main` commit,
applies and verifies Drizzle migrations explicitly through the STAGING Session
Pooler, then promotes that exact commit to the machine-managed `staging-release`
branch and invokes a secret Vercel Deploy Hook. Vercel builds the same verified
commit independently; exact-SHA readiness and public smoke checks gate acceptance.
Neither install, build, nor application startup runs migrations. See
`docs/architecture/vercel-staging-and-cicd.md` for the environment matrix and
operator contract.

Task 047 security hardening is accepted: migration 0015, verified TLS/SSL
enforcement, modern Supabase keys, password alignment, and Custom SMTP are live
in STAGING. Task 048 operational health, backup limitations, alerting, and
recovery contracts are documented in
[`observability-and-operational-readiness.md`](docs/architecture/observability-and-operational-readiness.md).

Task 049 Production provisioning is repository-gated and manual. The pre-client
Free Release Candidate may contain no real School/customer data; backup capability
and an isolated restore rehearsal are hard gates before onboarding. See
[`production-release-candidate.md`](docs/architecture/production-release-candidate.md).

---

## Contributing

This project is currently under active development.

Development conventions, architectural constraints, and coding rules are documented in:

- `PRD.md`
- `docs/architecture/`
- `docs/adr/`

Before making architectural changes, review the relevant documentation first.

---

## License

**License:** TBD

The licensing model will be decided before the project is publicly distributed.
