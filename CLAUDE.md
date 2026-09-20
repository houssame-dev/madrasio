# Madrasio — Claude Code Project Rules

## 1. Project Identity

Project name: Madrasio

Project type:
Multi-tenant School Management SaaS

Target:
Private schools in Morocco initially, with architecture suitable for future expansion.

V1 target:
Primary / Middle / Secondary school management.

Supported languages:
- Arabic
- French
- English

Supported directions:
- RTL
- LTR

Primary users in V1:
- Super Admin
- School Admin
- Teacher
- Parent

Important:
There is NO Student account/role in V1.

---

# 2. Core Architecture

Architecture style:

MODULAR MONOLITH

The V1 application is a single Next.js full-stack application.

Do NOT introduce Microservices in V1.

Do NOT introduce NestJS in V1.

Do NOT introduce Kubernetes in V1.

Do NOT introduce Kafka or RabbitMQ in V1.

Do NOT introduce Redis/BullMQ unless explicitly approved later.

The architecture must preserve strong module boundaries even though everything runs inside one application.

---

# 3. Official V1 Tech Stack

## Application

- Next.js
- React
- TypeScript

## UI

- Tailwind CSS
- shadcn/ui

## Server State

- TanStack Query

## Client/Application State

- Zustand

Use Zustand sparingly.
Do NOT place all server data into Zustand.

## Forms

- React Hook Form
- Zod

## Database

- Supabase PostgreSQL

## Database Access

- Drizzle ORM
- Drizzle migrations

Do NOT use Prisma unless explicitly approved.

## Authentication

- Supabase Auth

## File Storage

- Cloudflare R2

## Testing

- Vitest
- Testing Library
- Playwright

## Package Manager

- pnpm

## CI/CD

- GitHub
- GitHub Actions

## Development Hosting

- Vercel during development / personal non-commercial use

## Commercial Hosting

- Vercel Pro when the application becomes commercial

## Error Monitoring

- Sentry

---

# 4. Source of Truth Hierarchy

When making a decision, use this order:

1. Current user instruction
2. Approved product/domain decisions
3. Approved architecture decisions
4. Approved implementation conventions
5. Existing codebase
6. General engineering best practices

Do NOT invent product requirements when they are not defined.

If a new requirement conflicts with an approved architectural decision, STOP and report the conflict before implementing a major change.

---

# 5. Critical Non-Negotiable Rules

## 5.1 No NestJS

Next.js is the full-stack application in V1.

Use:
- Next.js Server Components
- Route Handlers
- Server Actions where appropriate

Do not create a separate NestJS backend.

---

## 5.2 No Prisma

Use Drizzle ORM.

---

## 5.3 No Microservices

Keep the system as a Modular Monolith in V1.

---

## 5.4 No Premature Infrastructure

Do not add:
- Redis
- BullMQ
- Kafka
- RabbitMQ
- Kubernetes
- service mesh
- distributed tracing infrastructure
- separate services

unless there is a clearly documented requirement and explicit approval.

---

# 6. Domain Architecture

The V1 domain contains these 12 modules:

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

IMPORTANT:

The product has 12 functional modules conceptually as previously finalized, but Authentication/Schools may be represented as platform/domain foundations depending on implementation grouping.

Do not renumber or invent additional product modules without approval.

---

# 7. Important Domain Ownership Rules

## Students

Students own:
- Student
- StudentEnrollment

StudentEnrollment is the source of truth for academic enrollment history.

Do NOT store a single mutable `class_id` on Student as the source of historical academic placement.

---

## Teachers

Teachers own:
- Teacher
- TeacherAssignment

TeacherAssignment is the ONLY source of truth for Teacher academic scope.

Do not create alternate teacher-scope systems.

---

## Parents

Parents own:
- Parent
- ParentStudent relationship

Parent access to students is determined through:
- ParentStudent
- StudentEnrollment
- Current School Context

Do not create an unrelated parent enrollment/scope system.

---

## Academic Structure

Academic structure owns concepts such as:
- AcademicYear
- AcademicPeriod
- Stage
- Level
- Track
- Curriculum
- CurriculumVersion
- CurriculumSubject

Track is optional where the academic structure does not use tracks.

---

## Subjects

Subject owns the identity/basic definition of a subject.

IMPORTANT:

A Subject does NOT own the academic coefficient.

Coefficient belongs to CurriculumSubject in the relevant curriculum/version context.

Example:

Mathematics coefficient in one track may be 7,
while Mathematics coefficient in another track may be 5.

Do NOT store one global coefficient directly on Subject.

---

## Classes

Classes own:
- Class
- Class lifecycle

A Class is academic-year specific.

A new academic year does NOT reuse the previous year's Class as the current class.

Historical Classes must remain traceable.

---

# 8. Grades Rules

Grades is a critical domain.

Grades owns:
- Gradebook
- Assessment
- Grade
- SubjectResult
- PeriodResult
- AnnualResult
- GradingConfiguration
- GradingConfigurationVersion

IMPORTANT RULES:

- Term/Period Result is NOT Annual Result.
- Annual Result is calculated separately from Period Results.
- Historical results must not change because current configuration changes.
- Grading configurations must be versioned when needed.
- CurriculumSubject coefficients must be historically safe.
- A published result is not the same thing as a draft/calculated result.
- Publication state and calculation/result state must remain conceptually separate.
- Official academic scores belong to Grades.
- Homework must NOT automatically become a Grade/Assessment.
- Homework → Grades integration is explicit and optional.

Grade values must distinguish appropriate states such as:
- valid score
- missing
- absent
- excused

Do NOT use NULL as a substitute for every possible business state.

---

# 9. Attendance Rules

Attendance is its own domain.

Attendance must not be represented as a side effect of Grades.

Typical statuses include:
- PRESENT
- ABSENT
- LATE
- EXCUSED

Attendance alerts are a business rule.

ABSENT does NOT automatically mean "send notification" unless the defined business rule requires it.

---

# 10. Homework Rules

Homework is independent from Grades.

Homework may optionally integrate with Grades through an explicit domain relationship.

Do NOT automatically create academic grades when Homework is created.

Homework may contain:
- homework
- targeting
- submissions
- submission status
- review information

---

# 11. Announcements Rules

Announcements support:

- Rich Text body
- Attachments
- Multiple audiences
- Multiple valid targets
- Teacher publishing
- Direct publishing
- Revisions/versioning
- Historical publication recipients

Rich Text must always be sanitized before rendering.

Attachments may include:
- PDF
- Images
- DOCX
- other explicitly allowed document types

Files are private by default.

Announcement versioning must preserve historical state.

A published version must represent a complete publishable state, not merely an undocumented patch.

Recipient resolution must be deterministic and deduplicate recipients.

Historical recipient snapshots must remain stable even if students later move classes or parent relationships change.

---

# 12. Notifications Rules

Notifications are persisted domain data.

The notification database record is the source of truth.

Realtime delivery is NOT the source of truth.

A notification may be generated by events such as:
- AnnouncementPublished
- AnnouncementRevisionPublished
- ResultPublished
- ResultRevisionPublished
- HomeworkPublished
- AttendanceAlertTriggered

Notification processing must be idempotent.

The same event must not create duplicate logical notifications for the same recipient.

Do not add email/SMS/push channels in V1 unless explicitly approved.

---

# 13. Multi-Tenancy

School is the primary tenant boundary.

Every school-scoped operation must resolve a valid School Context.

Never trust an arbitrary `schoolId` sent by the client without validating the user's active membership and authorization.

Cross-school access must be denied.

IMPORTANT:

Frontend filtering is NOT tenant isolation.

Tenant isolation must be enforced server-side.

---

# 14. Authentication vs Authorization

Authentication asks:

"Who is the user?"

Authorization asks:

"What may the user do?"

Supabase Auth provides authentication.

The application owns authorization.

Authorization uses:

- Role
- Permission
- School Membership
- TeacherAssignment
- ParentStudent
- StudentEnrollment
- Ownership
- Relationship
- Resource State

Role alone is NEVER sufficient for sensitive access.

---

# 15. Authorization Pipeline

For protected operations, think in this order:

Authenticated?
↓
Active User?
↓
Valid School Membership?
↓
Current School Context?
↓
Role?
↓
Permission?
↓
Academic Scope?
↓
Ownership / Relationship?
↓
Resource State?
↓
ALLOW / DENY

---

# 16. Frontend Security Rule

Frontend permission checks are for UX only.

Examples:
- hiding buttons
- hiding navigation items
- disabling controls

They are NOT security.

Every sensitive operation must be authorized again on the server.

---

# 17. Cross-Module Ownership

Each module owns its own business data.

A module MUST NOT directly mutate another module's owned database records.

Examples:

Grades:
- may read student context
- must NOT directly mutate Student

Announcements:
- may resolve Class/Student/Parent context
- must NOT directly mutate Class/Student data

Notifications:
- must NOT mutate Grades/Announcements business state

Use:
- application contracts
- queries
- domain operations
- domain events

instead of direct cross-module mutation.

---

# 18. Historical Integrity

Historical data is first-class.

Do NOT destroy or rewrite history because current state changed.

Especially protect:

- StudentEnrollment
- TeacherAssignment
- CurriculumVersion
- CurriculumSubject historical configuration
- GradingConfigurationVersion
- Published Results
- AnnouncementVersion
- PublicationRecipientSnapshot
- Audit records

Example:

If a student transfers from Class A to Class B,
historical data for Class A must remain correct.

---

# 19. Database Rules

Use:

- PostgreSQL
- Foreign Keys
- Unique Constraints
- Composite constraints where tenant integrity requires them
- Query-driven indexes
- Transactions
- Versioned migrations

Do not rely solely on application checks for important invariants that can be enforced by the database.

---

# 20. Database Naming

Tables:
- plural
- snake_case

Examples:

students
student_enrollments
teacher_assignments
gradebooks
announcement_versions

Columns:
- snake_case

Examples:

school_id
created_at
updated_at
published_at

---

# 21. Database Type Rules

Prefer:

- UUID for primary IDs
- timestamptz for instants
- date for calendar-only dates
- numeric/decimal for academic scores
- JSONB only for metadata/extensible payloads

Do NOT use JSONB instead of proper relational tables for core domain structure.

---

# 22. Deletion Rules

Do not use blind cascading deletes on historical academic data.

Prefer:
- archive
- deactivate
- end-date
- restrict
- explicit deletion only where appropriate

Do not add `deleted_at` to every table automatically.

Use lifecycle states where they represent real domain meaning.

---

# 23. Migrations

Never make undocumented production schema changes.

Database changes must be:

- generated as migrations
- reviewed
- tested
- version-controlled

Do not modify old applied migrations.

---

# 24. Drizzle Rules

Drizzle is used for:

- database schema
- queries
- migrations
- repository persistence

Domain code should not depend directly on Drizzle.

Keep Drizzle-specific details inside infrastructure/repositories.

---

# 25. API Rules

API version:

`/api/v1`

Use REST conventions.

Resource names are plural nouns.

Examples:

GET /api/v1/students
POST /api/v1/students
GET /api/v1/students/:id
PATCH /api/v1/students/:id

Business actions use explicit actions when appropriate:

POST /api/v1/students/:id/transfer
POST /api/v1/results/:id/publish
POST /api/v1/announcements/:id/publish

---

# 26. API Rules — Security

Every protected request must:
- authenticate
- resolve school context
- validate permission
- validate scope
- validate ownership/relationship
- validate resource state

Do not trust:
- client userId
- arbitrary schoolId
- arbitrary role
- client permission values

---

# 27. API Rules — Pagination

List endpoints should use a consistent pagination convention.

Default concept:

`page`
`pageSize`

The server must enforce a maximum page size.

Sorting and filtering values must be whitelisted.

Never allow arbitrary SQL-like field expressions from the client.

---

# 28. API Rules — Errors

Use stable machine-readable error codes.

Examples:

VALIDATION_ERROR
UNAUTHENTICATED
FORBIDDEN
NOT_FOUND
CONFLICT
BUSINESS_RULE_VIOLATION
RATE_LIMITED
INTERNAL_ERROR

Feature-specific errors may exist.

Example:

GRADEBOOK_CLOSED
STUDENT_NOT_ENROLLED
ANNOUNCEMENT_ALREADY_PUBLISHED

Frontend should depend primarily on error codes, not raw English messages.

---

# 29. API DTO Rules

Never expose internal database models directly.

Use request and response DTOs.

Do not expose:
- passwords
- secrets
- internal tokens
- unnecessary internal fields
- infrastructure details

---

# 30. Event Architecture

Use domain events only when there is real business meaning and one or more useful consumers.

Examples:

StudentEnrollmentChanged
TeacherAssignmentChanged
AcademicPeriodClosed
CurriculumSubjectUpdated
ResultPublished
ResultRevisionPublished
AttendanceAlertTriggered
HomeworkPublished
AnnouncementPublished
AnnouncementRevisionPublished

Do NOT create events for every CRUD operation.

---

# 31. Transactional Outbox

Critical cross-module events should use an Outbox pattern.

Conceptually:

Transaction:
- change domain state
- write outbox event

Then commit.

A background processor handles the event.

Do not publish critical business events only after commit with no durable record.

---

# 32. Event Idempotency

Consumers must be safe against duplicate delivery.

Do NOT assume exactly-once delivery.

Design for at-least-once processing.

---

# 33. Background Jobs

V1 should remain simple.

Do NOT introduce Redis/BullMQ unless workload justifies it.

Scheduled operations should be designed as due work rather than timer-dependent state.

Background jobs must reuse application use cases.

Do not duplicate business logic inside scheduler code.

---

# 34. Files

Actual file binaries are stored outside PostgreSQL.

Use Cloudflare R2.

PostgreSQL stores metadata and domain relationships.

Files are private by default.

File access requires source-resource authorization.

Never generate a temporary access URL before authorization.

---

# 35. File Security

Validate:
- size
- MIME type
- extension
- allowed category

Reject executable files and unsupported dangerous types.

Storage keys must NOT use raw user filenames.

Original filenames are presentation metadata only.

---

# 36. Rich Text

Rich text is untrusted input.

Always sanitize on the server before rendering or persisting a trusted/sanitized representation.

Do not render arbitrary raw HTML from users.

---

# 37. Frontend Rules

Use Server Components by default.

Use Client Components only when needed for:
- state
- events
- browser APIs
- interactive UI

Pages should be composition layers, not business-logic containers.

---

# 38. State Management

Server data:
- TanStack Query

Client/UI state:
- React local state
- Zustand when genuinely shared

Do NOT store the entire backend dataset in Zustand.

---

# 39. Query Keys

School-scoped queries must include School Context.

Examples:

`["students", schoolId, params]`

`["grades", schoolId, gradebookId, params]`

Parent child queries should also include studentId where relevant.

---

# 40. UI Permissions

Frontend may use permission metadata to:
- show/hide buttons
- show/hide navigation
- disable actions

But frontend authorization is never considered sufficient.

---

# 41. Forms

Use:
- React Hook Form
- Zod

Client validation improves UX.

Server validation is still mandatory.

Server validation errors should map cleanly back to fields where appropriate.

---

# 42. Data Tables

Reusable DataTable patterns should support when appropriate:
- pagination
- search
- filters
- sorting
- row actions
- loading
- empty
- error
- permissions

Do not create a completely different table pattern for each CRUD page.

---

# 43. URL State

Use URL state for shareable/navigation-relevant state such as:
- search
- filters
- sorting
- pagination
- selected view/tab where appropriate

Do not use global state for every page filter.

---

# 44. i18n

Supported languages:
- Arabic
- French
- English

All user-facing text must be translatable.

Do not hardcode user-facing strings throughout components.

---

# 45. RTL/LTR

Arabic must support RTL.

French/English use LTR.

Prefer CSS logical properties over hardcoded left/right positioning where appropriate.

---

# 46. Parent UX

Parent is a primary V1 user.

The Parent experience must support:

School Context
↓
Selected Child
↓
Grades / Attendance / Homework / Announcements

Child switching must invalidate/refetch relevant school-scoped queries.

---

# 47. Loading / Empty / Error

Every important page/query should have clear:
- loading
- empty
- error
- forbidden
- not-found

states where relevant.

Do not show an error state when the correct state is simply "No data yet."

---

# 48. Accessibility

Shared UI must support:
- keyboard navigation
- focus management
- labels
- appropriate semantics
- accessible dialogs
- table accessibility
- RTL-friendly behavior

---

# 49. Testing Rules

Use:
- Vitest
- Testing Library
- Playwright

Priority order:

1. Domain rules
2. Authorization
3. Tenant isolation
4. Historical integrity
5. Critical Use Cases
6. API
7. Critical E2E

Tests should verify behavior, not implementation details.

---

# 50. Test Database

Never run automated destructive tests against production.

Integration tests must use a dedicated test environment/database.

Tests must be deterministic and isolated.

---

# 51. Git Rules

Use small, meaningful commits.

Examples:

feat(auth): add login flow
feat(students): add enrollment
feat(grades): add gradebook
fix(auth): prevent cross-school access
test(grades): add coefficient calculations

Do not create commits containing unrelated changes.

---

# 52. Development Workflow

Before implementing a task:

1. Read this file.
2. Read relevant domain/architecture docs.
3. Identify the affected module.
4. Confirm dependencies.
5. Implement only the requested scope.
6. Add/update tests.
7. Run relevant checks.
8. Report what changed.

---

# 53. Claude Code Behavior Rules

Claude Code MUST:

- respect approved architecture
- avoid inventing business rules
- avoid unnecessary libraries
- avoid unnecessary abstractions
- avoid over-engineering
- prefer existing project conventions
- keep changes scoped
- explain architectural conflicts before making major changes

Claude Code MUST NOT:

- add NestJS
- add Prisma
- introduce microservices
- introduce Redis/BullMQ without explicit approval
- modify the database schema without a migration
- bypass authorization for convenience
- put business logic in UI components
- put business logic directly in route handlers
- introduce a new state management library without approval

---

# 54. When Requirements Are Ambiguous

If a task is ambiguous:

DO NOT invent a major business rule silently.

Instead:

- use the closest already-approved rule if the intent is clear
- otherwise stop and explain the ambiguity
- propose the smallest change needed

Do not rewrite architecture because of a small implementation ambiguity.

---

# 55. Approved Architecture Is Not To Be Rewritten Casually

The following are protected decisions:

- Modular Monolith
- Next.js full-stack
- Supabase PostgreSQL
- Drizzle
- Supabase Auth
- Cloudflare R2
- API /api/v1
- Server-side authorization
- School tenant boundary
- StudentEnrollment as enrollment source of truth
- TeacherAssignment as teacher scope source of truth
- Versioned curriculum/configuration
- Historical integrity
- Outbox/event architecture
- No mandatory realtime in V1
- No microservices in V1

Changing one of these requires explicit approval.

---

# 56. Definition of Done

A feature/module is NOT complete just because the UI works.

At minimum, evaluate:

- Domain
- Use Case
- Authorization
- Database
- Migration
- API
- Validation
- UI
- Loading state
- Empty state
- Error state
- Tests
- Documentation

Critical modules require additional security/history/idempotency checks.

---

# 57. Final Principle

Build the simplest architecture that satisfies the approved requirements.

Do not build hypothetical infrastructure.

Do not sacrifice domain integrity for short-term convenience.

Do not sacrifice security for frontend simplicity.

Do not sacrifice historical correctness for mutable current-state models.

Prefer:
- explicit
- boring
- testable
- maintainable
- incremental

over:
- clever
- magical
- premature
- distributed
- over-engineered

---

# 58. Current Project Status

Product/Domain Design:
APPROVED

Global System Review:
APPROVED

Architecture:
APPROVED

Implementation Blueprint:
APPROVED

Current implementation phase:

PROJECT BOOTSTRAP

Next objective:

Create the runnable Next.js foundation without implementing business modules yet.