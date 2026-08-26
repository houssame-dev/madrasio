# Frontend Students and Enrollment

## Information architecture

`/students` is the current-School Student directory. It is identity-focused and does not issue per-row placement requests. `/students/[id]` is the operational detail route with separate Profile and Academic Placement sections. Search, status, list page, selected Academic Year, and enrollment-history page are URL-backed where they are navigation-relevant.

## Roles and permissions

The workspace uses the committed `students.read` and `students.manage` permissions. `SCHOOL_ADMIN` and membership-scoped `SUPER_ADMIN` can manage Student identity and Enrollment operations. `TEACHER` uses the same list and detail routes in read-only mode; the server applies active Teacher profile and TeacherAssignment scope before pagination and detail resolution. The frontend never loads a School-wide set to filter for a Teacher. `PARENT` is denied this workspace because parent-facing related-child navigation belongs to the deferred `/children` experience.

Frontend checks only remove inappropriate controls. Every request remains subject to the server authentication, active User, current School membership, permission, academic scope, relationship, and resource-state pipeline.

## Student identity and lifecycle

Student forms submit only `firstName`, `lastName`, and optional `studentCode`. Student creation does not create an Enrollment, and Student has no Class, Academic Year, current-placement, or User/login field. V1 has no Student login account.

The UI exposes only the committed lifecycle graph: `ACTIVE -> INACTIVE/WITHDRAWN`, `INACTIVE -> ACTIVE/WITHDRAWN/ARCHIVED`, and `WITHDRAWN -> ARCHIVED`; `ARCHIVED` is terminal. Withdrawal and archive require confirmation. Student lifecycle and Enrollment lifecycle are displayed as separate statuses, and changing Student status never automatically ends or rewrites an Enrollment.

## Explicit Academic Year placement

The detail route resolves placement only through `GET /students/:id/enrollments/current?academicYearId=...`. If exactly one Academic Year is ACTIVE, the UI may initially select it as a convenience; multiple ACTIVE Years require explicit user selection. This is local view state and is never described or persisted as a global current Academic Year. Query keys include the exact Year, so a Year A response cannot be reused for Year B. A null response becomes a clear empty state rather than a stale Class label.

## Enrollment history

Administrator detail loads the paginated append-preserving Enrollment history. ACTIVE and ENDED rows remain visible with their exact Academic Year, Class, `effectiveFrom`, and inclusive `effectiveUntil`. Names are resolved through complete, bounded Academic Structure selector traversal rather than first-page assumptions. Teacher detail intentionally omits the administrator-only history endpoint.

## Creating an Enrollment

Enrollment creation is an explicit second operation. The form submits only `academicYearId`, `classId`, and `effectiveFrom`. Eligible Year choices are PLANNED or ACTIVE. Changing Year clears the Class value and fetches ACTIVE Classes for that exact Year; an incompatible Class is never retained in the form. The server remains authoritative for active Student eligibility, one-active-enrollment uniqueness, tenant integrity, and concurrency.

## Transfer workflow

Transfer uses the dedicated transactional `POST /students/:id/transfer` action. The form sends `academicYearId`, a different `toClassId`, and `effectiveDate`. It displays the selected-Year placement and explains that the prior row will be ended while a new ACTIVE row is created. The current Class is excluded from target options. The frontend does not calculate or persist the old `effectiveUntil`; the server owns the previous-calendar-day rule and transaction rollback.

## Ending an Enrollment

Only ACTIVE history rows expose End Enrollment. The confirmation form sends the exact committed `effectiveUntil` to `POST /student-enrollments/:id/end`. The row is never deleted, and repeated server success is handled as the same completed state without inserting client-side duplicates.

## Query keys and cache invalidation

Student keys begin with `['students', schoolId]` and distinguish filtered lists, Student detail, paginated history, and explicit-Year current placement. Task 025 still clears the complete QueryClient on School switch. Student records are not stored in Zustand or browser persistence.

Identity mutations invalidate the Student detail and list. Enrollment creation, transfer, and end invalidate every history page and every selected-Year placement for that Student, plus detail-dependent state; they do not clear unrelated QueryClient data and do not use optimistic historical mutations.

## Forms, errors, accessibility, and responsive behavior

React Hook Form and Zod reuse the committed server contracts for names, UUID relations, enum values, and ISO calendar dates. Stable Student feature codes map to safe field or operation messages; foreign-tenant, assignment-scope, constraint, and raw database details are never displayed.

The list and Enrollment history reuse the semantic responsive table shell with horizontal overflow. Detail sections stack on narrow screens. Dialogs fit and scroll within the viewport, trap and restore focus, close with Escape, and use labeled controls. Status always includes visible text rather than relying on color.

## Deferred UX

Parent `/children` pages, Student authentication, bulk/CSV creation, destructive delete, global Academic Year policy, Attendance, Grades, Homework, and Teacher Assignment workflows remain outside this feature. Authenticated Student CRUD Playwright coverage remains deferred until the repository has a reusable signed-in browser fixture.
