# Architecture Overview
## School Management System — V1

This document defines the approved high-level architecture of the School Management System.
It is the architectural reference for the V1 implementation.

It must be read together with:
- `README.md`
- `CLAUDE.md`
- `docs/domain/`
- `docs/adr/`

---

# 1. Architecture Goals

The V1 architecture is designed around the following goals:

- Strong domain integrity
- Clear module boundaries
- Secure multi-tenant isolation
- Historical academic correctness
- Simple deployment
- Low infrastructure cost
- High testability
- Maintainable code
- Incremental scalability
- Minimal premature complexity

The system should be easy to understand and operate for a solo developer while remaining structurally strong enough for future growth.

---

# 2. Architectural Style

The V1 system uses a:

> Modular Monolith

There is one main application containing multiple well-defined business modules.

We are intentionally NOT using microservices in V1.

The architecture must maintain strong logical boundaries so that modules can potentially be extracted later if actual scale or organizational requirements justify it.

---

# 3. Full-Stack Application

The application is implemented as a full-stack Next.js application.

High-level structure:

```text
Client
   ↓
Next.js
   ├── UI
   ├── Server Components
   ├── Route Handlers
   └── Server Actions where appropriate
        ↓
Application Layer
        ↓
Domain Layer
        ↓
Persistence Layer
        ↓
Supabase PostgreSQL
```

Next.js is both:

- the frontend framework
- the application/API runtime

There is no separate NestJS backend in V1.

---

# 4. Core Technical Stack

| Concern | Technology |
|---|---|
| Application | Next.js, React, TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Server State | TanStack Query |
| Client State | Zustand |
| Forms | React Hook Form |
| Validation | Zod |
| Database | Supabase PostgreSQL |
| Database Access | Drizzle ORM |
| Authentication | Supabase Auth |
| File Storage | Cloudflare R2 |
| Testing | Vitest, Testing Library, Playwright |
| Tooling | pnpm, GitHub, GitHub Actions, Sentry |

---

# 5. Application Layers

The application is logically divided into:

```text
Presentation
      ↓
Application
      ↓
Domain
      ↓
Infrastructure
```

These are logical architectural boundaries.

They do not necessarily represent independent deployable services.

---

# 6. Presentation Layer

The Presentation layer contains:

- Next.js pages
- layouts
- Route Handlers
- Server Actions where appropriate
- request DTOs
- response DTOs
- UI composition

**Responsibilities:**

- Receive input
- Validate transport-level data
- Resolve request context
- Call Application Use Cases
- Map results to API/UI representations

Presentation code must remain thin.

Business rules must not be implemented directly in Route Handlers or React components.

---

# 7. Application Layer

The Application layer orchestrates business operations.

It contains concepts such as:

- Commands
- Queries
- Use Cases
- Application policies
- Transaction boundaries
- Cross-module orchestration

**Examples:**

- CreateStudent
- TransferStudent
- EnterGrade
- PublishResult
- PublishAnnouncement
- MarkNotificationRead

The Application layer coordinates the operation but should not become a replacement for the Domain layer.

---

# 8. Domain Layer

The Domain layer contains the core business meaning of the system.

It includes:

- Entities
- Value Objects
- Domain Rules
- Domain Policies
- Domain Services
- Domain Events

**Examples:**

- StudentEnrollment
- TeacherAssignment
- Gradebook
- Assessment
- Result
- AnnouncementPublication
- Notification

The Domain layer must not depend directly on:

- Next.js
- React
- Drizzle
- Supabase
- HTTP
- Browser APIs
- R2

---

# 9. Infrastructure Layer

Infrastructure implements technical capabilities required by the Application and Domain layers.

**Examples:**

- Drizzle repositories
- PostgreSQL access
- Supabase integration
- Cloudflare R2 integration
- Outbox persistence
- Logging
- Sentry
- File storage
- Background execution

Infrastructure must not redefine business rules.

---

# 10. Domain Modules

The functional domain is divided into these modules:

1. Authentication
2. Schools
3. Students
4. Teachers
5. Parents
6. Academic Structure
7. Subjects
8. Classes
9. Grades
10. Attendance
11. Homework
12. Announcements
13. Notifications

Authentication and platform services may be grouped differently in the implementation, but the business responsibilities remain distinct.

---

# 11. Module Ownership

Each module owns its own:

- Business rules
- Domain entities
- Application Use Cases
- Persistence models
- Policies
- Module-specific events

A module may read information from another module through approved application/domain contracts or queries.

A module must not directly mutate another module's owned database records.

---

# 12. Cross-Module Communication

**Allowed mechanisms include:**

- Application contracts
- Explicit queries
- Domain operations
- Domain events

**Forbidden pattern:**

```text
Module A
   ↓
Directly updates Module B database tables
```

**Example:**

Grades
- ✅ may read student context
- ❌ must not directly modify Student

Announcements
- ✅ may resolve Class/Student/Parent context
- ❌ must not directly modify Class

Notifications
- ✅ may consume events
- ❌ must not modify source business state

---

# 13. Multi-Tenancy

The primary tenant boundary is:

> School

The system uses a shared PostgreSQL database with school-scoped data.

The application must resolve a valid School Context before performing school-scoped operations.

A user may potentially belong to multiple schools through:

> SchoolMembership

The active School Context determines which school's data the request operates on.

---

# 14. Tenant Isolation

Tenant isolation is enforced through multiple layers:

```text
Authentication
      ↓
School Membership
      ↓
School Context
      ↓
Authorization
      ↓
Scope-aware queries
      ↓
Database constraints
```

The frontend must never be considered a tenant isolation mechanism.

Passing an arbitrary schoolId from the client does not grant access to that school.

---

# 15. Authentication Architecture

Supabase Auth is responsible for identity/authentication concerns such as:

- Login
- Session management
- Account recovery
- Credential handling

The application's own authorization layer is responsible for:

- Roles
- Permissions
- School Membership
- Academic Scope
- Ownership
- Relationships
- Resource State

Supabase Auth does not replace the application's authorization model.

---

# 16. Authorization Architecture

Authorization follows:

```text
Authenticated?
     ↓
Active User?
     ↓
Valid School Membership?
     ↓
Current School Context?
     ↓
Role
     ↓
Permission
     ↓
Academic Scope
     ↓
Ownership / Relationship
     ↓
Resource State
     ↓
ALLOW / DENY
```

Role alone must never be treated as sufficient authorization for sensitive operations.

---

# 17. Teacher Scope

Teacher academic scope is derived exclusively from:

> TeacherAssignment

TeacherAssignment may define:

- Teacher
- Class
- Subject
- Academic Year
- Academic context
- Assignment lifecycle

No parallel or duplicate teacher-scope system should be introduced.

---

# 18. Parent Scope

Parent access is derived from:

> ParentStudent + StudentEnrollment

A parent may access only the children to whom they are currently authorized.

Parent access must be evaluated server-side.

---

# 19. Student Enrollment

StudentEnrollment is the source of truth for the student's academic placement history.

It is used to preserve:

- Class history
- Academic Year context
- Enrollment lifecycle
- Transfers
- Historical academic relationships

The Student entity must not be used as the sole source of historical class placement.

---

# 20. Class Lifecycle

Classes are academic-year-specific.

A new academic year creates a new Class context.

Historical Classes must remain available for historical academic records.

Current class membership must be derived from StudentEnrollment rather than a single mutable field on Student.

---

# 21. Curriculum Versioning

Curriculum structure is versioned:

```text
Curriculum
   ↓
CurriculumVersion
   ↓
CurriculumSubject
```

Curriculum versions allow the system to preserve historical academic configuration.

A configuration used by historical academic records must remain semantically stable.

---

# 22. Subject Coefficients

Subjects do not own a universal coefficient.

Coefficient belongs to the appropriate academic curriculum context:

```text
CurriculumVersion
      +
Subject
      +
Coefficient
      ↓
CurriculumSubject
```

This allows the same Subject to have different coefficients in different academic tracks, levels, or curriculum contexts.

---

# 23. Grades Architecture

Grades is one of the most critical domains.

It contains:

- Gradebook
- Assessment
- Grade
- SubjectResult
- PeriodResult
- AnnualResult
- GradingConfiguration
- GradingConfigurationVersion

The system explicitly separates:

> PeriodResult

from:

> AnnualResult

They must not be treated as the same concept.

---

# 24. Grading Configuration Versioning

Grading rules may change over time.

Therefore:

```text
GradingConfiguration
      ↓
GradingConfigurationVersion
```

Historical academic calculations must reference the appropriate configuration/version used at that time.

Changing a current configuration must not silently alter previously published academic results.

---

# 25. Official Results

The system distinguishes between:

- draft/calculated state
- finalized state
- published state
- revised state

Publication is not identical to calculation.

Historical published results must remain traceable.

---

# 26. Homework Integration

Homework is an independent domain.

Homework does not automatically create:

- Assessment
- Grade
- Result

Any relationship between Homework and Grades must be explicit.

---

# 27. Attendance

Attendance is a separate academic operation.

It should preserve the student's attendance history independently from Grades.

Attendance status may include concepts such as:

- PRESENT
- ABSENT
- LATE
- EXCUSED

The exact set of statuses is determined by the approved Attendance domain rules.

---

# 28. Announcements

Announcements support:

- Rich-text content
- Attachments
- Multiple audiences
- Multiple targets
- Direct publishing
- Scheduling
- Revisions
- Historical publication records
- Historical recipient snapshots

Publishing is an explicit business operation.

---

# 29. Announcement Versioning

A published Announcement Version is treated as a historical snapshot.

Future revisions must not rewrite the meaning of previously published versions.

Historical recipient snapshots must remain stable even if:

- students move classes
- parent relationships change
- teacher assignments change

---

# 30. Recipient Resolution

Announcement recipient resolution is a domain operation.

It must:

- validate targets
- resolve recipients
- deduplicate recipients
- preserve publication-time snapshot
- respect School Context
- respect authorization

Recipient generation must not rely on current data after publication to reconstruct historical recipients.

---

# 31. Notifications

Notifications are persistent application data.

The source of truth is the database.

The basic flow is:

```text
Domain Event
    ↓
Outbox
    ↓
Notification Handler
    ↓
Notification Record
    ↓
Optional Realtime Delivery
```

Realtime is an enhancement and is not the source of truth.

---

# 32. Event Architecture

Only meaningful business events should be published.

**Examples:**

- StudentEnrollmentChanged
- TeacherAssignmentChanged
- AcademicPeriodClosed
- CurriculumSubjectUpdated
- ResultPublished
- ResultRevisionPublished
- AttendanceAlertTriggered
- HomeworkPublished
- AnnouncementPublished
- AnnouncementRevisionPublished

Events should not exist merely because a CRUD operation happened.

---

# 33. Transactional Outbox

Important cross-module events use an Outbox pattern.

The producing transaction should atomically persist:

> Domain State Change + Outbox Event

Then commit.

An asynchronous processor handles the event.

This prevents the following failure:

```text
Database Commit ✅
Event Publication ❌
```

which could otherwise result in lost events.

---

# 34. Event Idempotency

Consumers must assume that events may be delivered more than once.

Event handlers must therefore be idempotent.

For example:

> Same Event + Same Recipient

must not create duplicate logical Notifications.

---

# 35. Background Jobs

V1 intentionally avoids introducing Redis/BullMQ unless actual workload justifies it.

Scheduled work should be implemented as reliable "due work" rather than timer-dependent application state.

Background execution should always reuse Application Use Cases.

Business logic must not be duplicated inside job handlers.

---

# 36. Realtime Architecture

Realtime is optional in V1.

The system remains fully correct without realtime.

The primary mechanism is:

> Persisted Notification + TanStack Query + Refetch / reconciliation

Realtime may later be implemented using Supabase Realtime or another transport if actual product requirements justify it.

---

# 37. File Storage

Binary files are stored outside PostgreSQL.

**Architecture:**

```text
PostgreSQL
    ↓
File Metadata

Cloudflare R2
    ↓
Actual Binary
```

Files are private by default.

File access requires:

- Authentication
- School Context
- Source Resource Authorization
- Attachment Authorization

---

# 38. File Security

Uploads must validate:

- File size
- MIME type
- Extension
- Allowed category

Storage keys must not use raw user filenames.

Original names are presentation metadata.

The architecture supports future malware/virus scanning.

Files in a non-ready processing state must not be treated as publishable where the resource requires ready attachments.

---

# 39. Database Architecture

The system uses:

> Supabase PostgreSQL + Drizzle ORM

Database design follows:

- Relational modeling
- Foreign Keys
- Unique Constraints
- Composite constraints where required
- Query-driven indexes
- Historical integrity
- Versioned migrations
- Explicit transactions

---

# 40. Database Naming

Tables and columns use:

> snake_case

**Examples:**

- student_enrollments
- teacher_assignments
- created_at
- updated_at
- school_id
- student_id

Primary keys use UUIDs.

---

# 41. JSONB Usage

JSONB is allowed for extensible metadata such as:

- Audit metadata
- Outbox payload
- Notification metadata
- Provider-specific metadata

JSONB must not replace proper relational modeling for core entities.

---

# 42. Database Deletion Strategy

Historical academic data must not be destroyed through blind cascade deletion.

Prefer:

- Archive
- End
- Deactivate
- Restrict
- Explicit deletion where appropriate

Do not add a generic `deleted_at` column to every entity unless the domain actually requires soft deletion.

---

# 43. API Architecture

The API is:

> REST + `/api/v1`

API handlers are thin.

**Typical flow:**

```text
Request
   ↓
Validation
   ↓
Authentication
   ↓
School Context
   ↓
Authorization
   ↓
Use Case
   ↓
Response DTO
```

---

# 44. API Resource Conventions

**Examples:**

```text
GET  /api/v1/students
GET  /api/v1/students/:id
POST /api/v1/students
PATCH /api/v1/students/:id
```

**Business actions:**

```text
POST /api/v1/students/:id/transfer
POST /api/v1/results/:id/publish
POST /api/v1/announcements/:id/publish
POST /api/v1/notifications/read-all
```

---

# 45. API Error Model

API errors use stable machine-readable codes.

**Examples:**

- VALIDATION_ERROR
- UNAUTHENTICATED
- FORBIDDEN
- NOT_FOUND
- CONFLICT
- BUSINESS_RULE_VIOLATION
- RATE_LIMITED
- INTERNAL_ERROR

Feature-specific codes may be used where helpful.

**Examples:**

- GRADEBOOK_CLOSED
- STUDENT_NOT_ENROLLED
- ANNOUNCEMENT_ALREADY_PUBLISHED

---

# 46. API Pagination

List APIs use consistent pagination and filtering conventions.

The server must enforce maximum page sizes.

Sorting and filtering fields must be explicitly whitelisted.

Clients must never be able to send arbitrary SQL-like field expressions.

---

# 47. Frontend Architecture

The frontend is organized around:

> App Shell + Routes + Domain Features + Shared UI + Data Layer

Server Components are the default.

Client Components are used only when interactivity or browser behavior requires them.

---

# 48. Frontend State

**Server State:**

> TanStack Query

Examples: Students, Teachers, Classes, Grades, Attendance, Homework, Announcements, Notifications

**Client/UI State:**

> Local React state + Zustand where genuinely shared

Do not place the entire backend dataset into a global client store.

---

# 49. Frontend Permissions

Frontend permission checks exist only to improve the user experience.

**Examples:**

- Hide unavailable actions
- Hide navigation
- Disable controls

The backend must always re-check authorization.

---

# 50. School Context in Frontend

School-scoped query/cache keys must include School Context.

**Example:**

```text
["students", schoolId, filters]
```

This prevents data from one school being displayed after switching to another school.

---

# 51. Parent Child Context

Parent-facing school data is scoped by:

> School Context + Selected Child

**Example:**

```text
["grades", schoolId, studentId, periodId]
```

Changing the selected child must invalidate/refetch relevant data.

---

# 52. Internationalization

The UI supports:

- Arabic
- French
- English

All user-facing strings must be translatable.

Arabic must support RTL.

French and English use LTR.

---

# 53. Testing Architecture

Testing uses:

- Unit Tests
- Application Tests
- Integration/API Tests
- End-to-End Tests
- Security Tests

**Primary tools:**

- Vitest
- Testing Library
- Playwright

**Highest testing priority goes to:**

- Authorization
- Tenant isolation
- Grades
- Enrollment
- Teacher scope
- Parent scope
- Historical integrity
- Announcement targeting
- Notification idempotency
- File access

---

# 54. Deployment Architecture

**Development:**

> Vercel + Supabase Free + Cloudflare R2 + GitHub

**Commercial V1:**

> Vercel Pro + Supabase Free initially + Cloudflare R2

Infrastructure should be upgraded only when actual requirements justify it.

---

# 55. Infrastructure Cost Strategy

The project intentionally maximizes free tiers during development and early MVP usage.

**Target:**

| Stage | Cost |
|---|---|
| Development | ≈ $0 |
| Early commercial MVP | ≈ Vercel Pro only |
| Growth | → Upgrade only the actual bottleneck |

Free-tier limits must always be checked before depending on a service for a production-critical capability.

---

# 56. Repository Structure

The approved high-level structure is:

```text
school_management_system/
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
├── CLAUDE.md
├── README.md
└── package.json
```

---

# 57. Module Internal Structure

A typical module follows:

```text
module/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── policies/
│   ├── services/
│   └── events/
│
├── application/
│   ├── commands/
│   └── queries/
│
├── infrastructure/
│   └── repositories/
│
└── presentation/
    ├── dto/
    └── mappers/
```

Not every module must contain every folder.

Complexity should match actual domain needs.

---

# 58. Shared Platform Layer

Cross-cutting technical capabilities live separately from domain modules.

**Examples:**

```text
lib/
├── api/
├── auth/
├── authorization/
├── config/
├── context/
├── db/
├── errors/
├── events/
├── audit/
├── files/
├── jobs/
├── observability/
├── security/
└── supabase/
```

Platform code must not contain domain business rules.

---

# 59. Development Order

Implementation proceeds in dependency order:

```text
Foundation
   ↓
Shared Platform
   ↓
Authentication
   ↓
Schools & Membership
   ↓
Academic Structure
   ↓
Students / Teachers / Parents
   ↓
Authorization Hardening
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

---

# 60. Milestones

The major development milestones are:

- **M1** — Foundation
- **M2** — Identity & School Context
- **M3** — Academic Structure
- **M4** — People & Access Scope
- **M5** — Grades
- **M6** — Attendance + Homework
- **M7** — Announcements + Notifications
- **M8** — Hardening & Production Readiness

Each milestone must satisfy its Definition of Done before proceeding.

---

# 61. Definition of Done

A feature/module is not complete simply because its UI works.

A complete implementation normally requires:

- Domain
- Application
- Authorization
- Database
- Migration
- Repository
- API
- Validation
- UI
- Loading
- Empty
- Error
- Tests
- Documentation

Critical modules additionally require explicit checks for:

- Security
- Tenant isolation
- Historical integrity
- Idempotency
- Concurrency where applicable

---

# 62. Architecture Anti-Patterns

The following are intentionally prohibited in V1:

- ❌ NestJS backend
- ❌ Prisma
- ❌ Microservices
- ❌ Kubernetes
- ❌ Kafka
- ❌ RabbitMQ
- ❌ Redis/BullMQ without justification
- ❌ Business logic in Route Handlers
- ❌ Business logic in React components
- ❌ Direct database access from UI
- ❌ Cross-module direct database writes
- ❌ Global Zustand store for all server data
- ❌ Raw unsanitized rich text rendering
- ❌ Public-by-default private school files
- ❌ Manual production schema changes

---

# 63. Architecture Change Policy

Approved architectural decisions should not be changed casually.

A significant architectural change requires:

- Clear reason
- Alternatives considered
- Impact analysis
- Updated documentation
- ADR when appropriate
- Explicit approval before implementation

---

# 64. Current Architecture Status

The following have been approved:

| Area | Status |
|---|---|
| Product Design | ✅ |
| Domain Model | ✅ |
| Global System Review | ✅ |
| Roles & Permissions | ✅ |
| System Boundaries | ✅ |
| Application Architecture | ✅ |
| Backend Architecture | ✅ |
| Frontend Architecture | ✅ |
| Database Architecture | ✅ |
| API Architecture | ✅ |
| Authentication Architecture | ✅ |
| Event Architecture | ✅ |
| File Storage Architecture | ✅ |
| Notification Architecture | ✅ |
| Testing Architecture | ✅ |
| Deployment Architecture | ✅ |
| Tech Stack | ✅ |
| Implementation Blueprint | ✅ |
| Definition of Done | ✅ |

---

# 65. Current Next Step

The architecture phase is complete.

The next phase is:

> Project Bootstrap

The goal is to create and verify the runnable technical foundation before implementing business modules.

**Bootstrap must include:**

- Next.js
- TypeScript
- pnpm
- Tailwind CSS
- shadcn/ui
- Supabase integration
- Drizzle
- Testing
- Environment configuration
- Git/CI foundation

No business module should be implemented until the Bootstrap Foundation checkpoint passes successfully.

---

# 66. Final Principle

The project follows a simple philosophy:

> Build the simplest architecture that satisfies the current product requirements, preserve the domain boundaries needed for correctness, and add complexity only when real usage proves it necessary.

The system should remain:

- Simple
- Explicit
- Secure
- Testable
- Maintainable
- Historically Correct
- Incrementally Scalable