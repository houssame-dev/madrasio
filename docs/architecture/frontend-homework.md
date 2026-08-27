# Frontend Homework

## Information architecture and permissions

`/homework` is the staff Homework workspace and `/homework/:id` is its lifecycle, targeting, roster, and Submission detail. The UI consumes the committed Task 022 APIs and creates no parallel Homework model. `SCHOOL_ADMIN`, membership-scoped `SUPER_ADMIN`, and `TEACHER` can enter the workspace; Teacher results and writes remain constrained by server authorization and exact active assignment scope.

Parents do not receive the broad Homework navigation or list because V1 has no child-specific Homework discovery endpoint. A Parent may open a known `/homework/:id` resource in a deliberately read-only view. That view requests only the server-filtered Homework detail and related-child Submissions. The future child portal is responsible for discovery and is outside Task 033.

Frontend permission checks are presentation only. Every request remains subject to authentication, active User state, authoritative current School context, permission checks, Teacher scope, Parent relationship, historical Enrollment eligibility, and safe cross-tenant not-found behavior.

## List, filters, and creation authorship

The staff list uses backend pagination and URL-backed status, Academic Year, Class, due-date range, and bounded search filters. It renders only list DTO fields and does not issue target-per-row requests. Academic Year, Subject, and Class labels come from current-School reference APIs, while the list itself remains server scoped.

Homework creation sends only `subjectId`, `academicYearId`, `academicPeriodId`, `title`, nullable plain-text `description`, and a `YYYY-MM-DD` `dueDate`. It never submits School, User, Teacher, role, permission, lifecycle status, or timestamps. The author is always the current signed-in User's ACTIVE Teacher profile as resolved by the backend. Because the backend requires that author even for SchoolAdmin, the create action is shown only when the current User has a matching ACTIVE Teacher profile and exact ACTIVE assignment; there is no Teacher selector or impersonation workflow.

The form narrows Year, Period, Subject, and Class affordances to operational same-context choices, but those controls are conveniences rather than authority. Period containment, assignment validity, tenant integrity, and all business invariants remain server decisions. Calendar dates stay plain DATE strings and are never converted to instants.

## Homework lifecycle and targets

The UI exposes only the forward lifecycle `DRAFT → PUBLISHED → CLOSED → ARCHIVED`, with confirmation copy explaining consequences. DRAFT permits structural editing and CLASS target attachment. Publishing requires at least one valid ACTIVE Class target and freezes title, description, due date, and targets. CLOSED stops new Submission creation; ARCHIVED is terminal. No delete or backward-transition control exists.

Targets use only `GET/POST /api/v1/homeworks/:id/targets` with an exact `classIds` batch. Multiple Classes are supported, duplicate selection is rejected client-side, and Teacher choices are narrowed to exact Class+Subject+AcademicYear assignments. The committed API has no target removal route, so the UI neither simulates nor exposes removal. Classes from another Year or School never become selectable.

## Authoritative roster and historical eligibility

`GET /api/v1/homeworks/:id/students` is the only staff roster source. The UI never builds a Homework roster from the generic Student list, current Class membership, or current Student status. The backend resolves StudentEnrollment eligibility on the inclusive Homework `dueDate`, so historically eligible Students remain visible even after transfer or deactivation.

Each roster row contains the server-returned Student and nullable Submission. A null Submission is displayed as **Not submitted**, but that label is not persisted and is not a fifth status. The roster is paginated and preserves backend metadata.

## Submission and review lifecycle

Staff can record exactly one Submission for an eligible roster Student only while Homework is PUBLISHED. Creation sends `studentId` and optional plain-text `content`; status and `submittedAt` are server derived. The UI displays the returned `SUBMITTED` or `LATE` value and never calculates lateness in the browser.

Review uses the dedicated action endpoint. `SUBMITTED` or `LATE` may become `REVIEWED`, and `REVIEWED` may become `RETURNED`. Returned work on PUBLISHED Homework is resubmitted through PATCH of the same logical Submission row with `content` only. The UI does not create a replacement row, accept client timestamps, or provide arbitrary status editing. Submission review has no grade, score, rubric, result, feedback, notification, or outbox side effect in this task.

## Errors, caching, and stale scope

Controlled feature codes are translated into stable user-facing messages. Foreign or unavailable resources use a generic safe state and never reveal another School's existence. Validation, conflict, lifecycle, immutable-state, author-scope, and historical-eligibility failures retain the user's local input where applicable.

All Homework query keys include authoritative current School plus the exact resource/filter context. Target attachment invalidates only the target, affected roster, and detail prefixes. Submission creation, resubmission, or review invalidates only the affected roster and Submission caches. Lifecycle edits invalidate the exact detail and list prefix. The application shell still clears the entire QueryClient on School switch, preventing stale prior-School data from rendering.

## Accessibility, responsive behavior, and boundaries

Lists and rosters use semantic tables inside responsive overflow containers, forms have explicit labels and validation feedback, lifecycle actions require confirmation, statuses remain textual, and all actions are keyboard operable. Narrow screens preserve usable stacked filters and dialogs without inventing separate mobile workflows.

No backend, schema, migration, attachment storage, rich-text editor, bulk import, export, realtime, Student portal, Parent discovery, Gradebook, Results, Attendance, Notification, or Outbox work is included. The server remains authoritative for every domain and authorization decision.
