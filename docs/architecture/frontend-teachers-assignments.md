# Frontend Teachers and Assignments

## Information architecture and roles

`/teachers` is the current-School Teacher workspace and `/teachers/[id]` contains Profile, Linked account, and Assignment history sections. Search, status, list page, and history page are URL-backed where relevant.

`SCHOOL_ADMIN` and membership-scoped `SUPER_ADMIN` can manage all profiles and Assignments in the current School. `TEACHER` uses the same list endpoint, which the server authoritatively limits to profiles linked to the current User; the resulting self-focused view never enumerates or filters a School-wide directory in the browser. Teacher detail and history are read-only. `PARENT` is denied. Frontend permission checks only shape UX; server authorization remains authoritative.

## Teacher profile, account link, and lifecycle

Teacher is a School-scoped profile containing identity, an optional Teacher code, lifecycle status, and optional application `userId`. It contains no Class, Subject, year, role, permission, or Assignment array. Creating a profile never creates an Assignment or login and never changes a SchoolMembership role.

The committed API has no eligible-member discovery endpoint. The admin form therefore exposes the existing optional UUID contract with explicit copy that it is for an already known application User from an approved administrative process. The server verifies an ACTIVE User and ACTIVE same-School membership. Production UI never reads Supabase Auth, service-role data, auth metadata, or arbitrary users. Detail displays only a neutral linked/unlinked state, not the raw identifier or account internals.

The lifecycle is `ACTIVE -> INACTIVE`, `INACTIVE -> ACTIVE/ARCHIVED`, with `ARCHIVED` terminal. Deactivate and archive require confirmation. Becoming INACTIVE immediately removes operational scope, but the UI does not claim or attempt to end/delete Assignment history.

## TeacherAssignment scope and history

TeacherAssignment is the only academic-scope source of truth. Every history row displays the exact Academic Year, Class, Subject, effective dates, and independent Assignment status. ACTIVE and ENDED rows remain visible. Profile status is never derived from Assignment status.

Assignment creation is available only for an ACTIVE Teacher and submits exactly `academicYearId`, `classId`, `subjectId`, and `effectiveFrom`. PLANNED/ACTIVE Years, ACTIVE Subjects, and ACTIVE Classes are offered. Year selection drives a complete bounded Class query and clears an incompatible Class when changed. Complete ACTIVE Assignment history prevents an obvious exact duplicate before submission; the server remains authoritative for races and tenant/context integrity.

Ending uses the dedicated endpoint and an inclusive `effectiveUntil`. It preserves the ENDED row. There is no fake reassignment operation: changing scope is two explicit admin actions—end the old Assignment, then create a new one—and the frontend never silently chains them.

## Self discovery, queries, and cache

Teacher self-discovery uses `GET /api/v1/teachers`. The backend applies current User ownership before pagination, so one or multiple linked profiles can safely appear. A direct request for another profile remains a controlled unavailable/not-found state.

Teacher query keys are current-School scoped and distinguish filtered lists, detail, paginated history, and the complete ACTIVE set used for duplicate prevention. Profile mutations invalidate detail and list; Assignment mutations invalidate only that Teacher's history/detail boundary. Task 025 still clears the entire tenant cache on School switch. No Teacher data is stored in Zustand or browser persistence.

## Validation, errors, responsive UI, and deferred work

Forms use React Hook Form and Zod with the committed UUID, identity, enum, date, and exact-body contracts. Stable Teacher feature codes map to safe messages; foreign-resource or database details are not shown. Tables use semantic headers and horizontal overflow, detail sections stack on narrow screens, and modal dialogs trap and restore focus. Status always includes visible text.

Eligible-account search, Teacher invitations/login creation, membership administration, bulk/CSV workflows, an atomic reassignment endpoint, Teacher dashboard, and operational Grade/Attendance/Homework screens are deferred. No backend, schema, or migration change is part of this frontend feature.
