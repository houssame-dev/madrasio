# Parents and Relationships API

> Task 018 — Application and REST API boundary for Parent profiles and current
> child relationships. This document complements the domain model, business
> rules, ADR-007, ADR-017, and the authentication/authorization documents.

## Boundary and sources of truth

All operations use the authoritative current School from
`requireCurrentContext()`. Request bodies never accept School, role,
permissions, membership state, child arrays, or relationship status. Every
repository query includes the current School id, and foreign resources are
hidden as not found or invalid relationship context.

Parent stores identity and lifecycle only. `ParentStudent` is the sole source
of Parent-to-Student relationship scope; Parent has no `studentIds`,
`currentChildren`, Class, or enrollment fields. `StudentEnrollment` separately
determines where an authorized Student is placed academically.

The implementation lives under `apps/web/lib/modules/parents`: domain owns
strict contracts and lifecycle rules, application owns authorization and
relationship policy, and infrastructure/repositories owns Drizzle access.
`apps/web/lib/api/parents.ts` provides the shared thin HTTP adapter.

## Permissions and ownership

Task 018 adds the minimum stable identifiers `parents.read` and
`parents.manage` to the existing centralized vocabulary.

- SCHOOL_ADMIN and membership-scoped SUPER_ADMIN can list, create, update, and
  link Parents, inspect history, and end relationships.
- PARENT receives `parents.read` but broad list access is denied. A Parent may
  read only profiles linked to the authenticated User and only ACTIVE child
  relationships. Self-PATCH is limited to first and last name; code, User link,
  and lifecycle remain administrative.
- TEACHER receives neither Parent permission and has no directory or history
  access.

Parent role or profile alone creates no child scope. Current access requires an
ACTIVE linked Parent profile and an ACTIVE ParentStudent row in the current
School. INACTIVE/ARCHIVED Parents contribute no current scope even if a stale
ACTIVE relationship remains for historical integrity.

## Parent and User lifecycle

Parent may exist without a User. A non-null `userId` must identify an ACTIVE
application User with ACTIVE membership in the current School. Linking never
creates Auth users or memberships and never changes the membership role. The
approved model does not require role=PARENT for linking, so no compatibility
rule is invented. Multiple profiles may link to one User because the committed
schema permits it.

Parent lifecycle is `ACTIVE → INACTIVE`, `INACTIVE → ACTIVE/ARCHIVED`, with
ARCHIVED terminal. Status changes never mutate ParentStudent history.
Parent code is optional and unique per School when present.

## Relationships

Relationship creation accepts only `studentId`; School and ACTIVE status are
server-controlled. Parent must be ACTIVE. The Student must belong to the same
School; ACTIVE and INACTIVE Students may be linked, while WITHDRAWN/ARCHIVED
Students cannot receive a new current relationship. Enrollment is not required.

The committed partial unique index permits multiple children per Parent and
multiple Parents per Student, while allowing only one ACTIVE row for an exact
Parent/Student pair. Duplicate concurrent creation returns
`DUPLICATE_PARENT_STUDENT_RELATIONSHIP`.

END is explicit and idempotent. It changes ACTIVE to ENDED without deletion.
Relinking creates a new ACTIVE row beside the ENDED historical row; relationship
identity is never patched or reactivated in place.

School administrators see ACTIVE and ENDED history. Parent self-access returns
ACTIVE relationships only; historical ENDED relationships do not authorize
Student identity, placement, Grades, Homework, Attendance, Announcements, or
Results.

## Routes

| Resource | Routes |
|---|---|
| Parent | `GET/POST /api/v1/parents`; `GET/PATCH /api/v1/parents/:id` |
| ParentStudent | `GET/POST /api/v1/parents/:id/students`; `POST /api/v1/parent-student-relationships/:id/end` |
| Parent self bootstrap | `GET /api/v1/me/parent-profiles` |

There are no DELETE routes and no generic relationship PATCH.

## Current Parent self bootstrap

`GET /api/v1/me/parent-profiles` gives a fresh Parent portal enough identity
to navigate the existing child-scoped APIs without accepting a client-selected
Parent or User id. It returns every ACTIVE Parent profile where `school_id` is
the authoritative current School and `user_id` is the authenticated User,
together with only ACTIVE ParentStudent relationships and a minimal Student
identity (`id`, names, optional code). A profile with no current children has
`children: []`; a User with no ACTIVE linked profile receives `data: []`.

The endpoint is always self-owned even for an administrator or membership-
scoped SUPER_ADMIN; it never becomes a School-wide Parent directory. TEACHER
has no `parents.read` permission and receives no Parent data. INACTIVE or
ARCHIVED profiles and ENDED relationships are excluded, but their historical
rows remain unchanged. Profiles and children are restricted to the current
School, so switching School contexts changes the returned collection.

The bootstrap deliberately does not embed a current Class or current
Enrollment. There is no global current AcademicYear policy; clients use the
returned Student id with the existing explicit current-placement endpoint and
an `academicYearId` when placement is needed. The existing administrator-only
`GET /api/v1/parents` behavior is unchanged.

## Cross-module behavior and history

The shared Parent scope resolver, Task 016 Student relationship check, and
Result recipient query now require an ACTIVE Parent profile. Announcement
recipient loading already enforced this rule. All current paths also require
ACTIVE ParentStudent and applicable membership/enrollment context.

Ending a relationship changes future Student access and future Announcement
and Result recipient resolution. Existing publication snapshots, Result event
recipient arrays, Notifications, StudentEnrollments, HomeworkSubmissions,
Attendance, Grades, and Results remain untouched and historically stable.

## Responses, filtering, and errors

Detail and mutation responses use `{ "data": ... }`. Lists use page/pageSize/
total metadata, default page size 50, maximum 100. Parent filters are status,
exact code, bounded case-insensitive name/code search, and Student through an
ACTIVE ParentStudent. Relationship history filters by status and Student. SQL
filtering occurs before pagination; ordering is deterministic.

Feature errors are `PARENT_NOT_FOUND`, `PARENT_NOT_ACTIVE`,
`DUPLICATE_PARENT_CODE`, `PARENT_RELATIONSHIP_NOT_FOUND`,
`DUPLICATE_PARENT_STUDENT_RELATIONSHIP`, `INVALID_RELATIONSHIP_CONTEXT`,
`INVALID_USER_LINK`, and `INVALID_PARENT_STATUS_TRANSITION`. SQL details and
constraint names are never exposed.

Task 018 uses the committed schema and migrations unchanged and introduces no
UI, contact/chat, custody, billing, Auth onboarding, membership mutation, RLS,
or migration.
