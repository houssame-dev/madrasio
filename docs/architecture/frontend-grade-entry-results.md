# Frontend Grade Entry and Results

## Information architecture

`/grades` remains the grading entry point. `/grades/[id]` owns one exact
Gradebook context, Assessment setup, Assessment-scoped Grade entry, and the
persisted Gradebook matrix. `/grades/results` is a separate administrative
workspace with Subject, Period, and Annual Result views. Parent Result
consumption, report cards, exports, rankings, and analytics are not part of
this workspace.

## Grade entry

Grade entry opens from a PUBLISHED Assessment only while its Gradebook is
OPEN. The roster comes from the authoritative bounded
`GET /api/v1/gradebooks/:id/grades` contract; the browser never constructs it
from a School-wide Student list. Existing Grades prepopulate exact state and
score. A Student without a Grade remains “Not entered” and is not silently
persisted as MISSING.

The editor preserves score strings and accepts the committed Grade states:
`VALID`, `MISSING`, `ABSENT`, and `EXCUSED`. VALID requires a non-negative
`numeric(6,2)`-compatible score no greater than the Assessment maximum.
Changing to a non-scored state clears the score and sends `null`. Dirty rows
are sent together through one `PUT /api/v1/assessments/:id/grades` request;
there are no per-row writes, optimistic saves, or automatic Result
calculations. Pages are limited to 100 Students to match the atomic backend
batch maximum.

Dirty state is visible, request failure preserves all edits, browser unload is
guarded, and closing or changing a dirty page requires confirmation. Grades
are never written to local storage and there is no autosave.

## Persisted Gradebook matrix

The Gradebook detail renders the existing server matrix across Students and
Assessments with horizontal scrolling and a sticky Student identity column.
Absent Grade rows remain visibly unentered. The browser displays Grade state
and exact stored score only; it computes no totals, averages, weights,
coefficients, or pass/fail values.

## Result separation and calculation

SubjectResult, PeriodResult, and AnnualResult are independent tabs and API
resources. Subject calculation submits exact Gradebook plus Student context.
Period calculation submits Student, Year, Period, and Class. Annual calculation
submits Student, Year, and Class and is never derived from the latest Period.
All values, rounding, completeness, Assessment weighting, and
CurriculumSubject coefficient resolution remain in the backend fixed-point
engine.

Calculation failures render stable feature-code copy. A
`CALCULATION_INCOMPLETE` response additionally displays the server's exact
machine-readable reason and safe detail list; an incomplete calculation is
never translated to zero or persisted by the frontend.

## Finalization, publication, and revision

School administrators can confirm the one-way `CALCULATED → FINALIZED`
operation. A FINALIZED Result exposes initial publication and explicit
revision actions. Initial publication creates an immutable snapshot and lets
the backend resolve eligible Parent recipients; zero recipients is successful.
The UI never accepts recipient IDs and reports that Notifications are processed
asynchronously rather than claiming immediate delivery.

Revision calls only `POST /api/v1/results/:id/revise`. It does not simulate
calculate, finalize, and publish as separate requests. Opening an intentional
revision creates one browser UUID idempotency key. Retries while that
confirmation remains open reuse the key; closing it and starting a new
intentional revision creates a new key. Previous publications are described as
immutable.

The current API does not expose ResultPublication history reads or a published
flag on Result DTOs. Consequently the detail can execute initial publication
and revision, with controlled backend conflicts if the wrong action is chosen,
but cannot browse historical snapshots or determine the latest publication
before acting. No speculative history endpoint or client-side publication
state was added.

## Authorization and tenant boundary

SCHOOL_ADMIN and current-School SUPER_ADMIN receive backend-authorized Result
management. Teachers use Grade entry and SubjectResult calculation only through
the backend's ACTIVE Teacher profile plus exact ACTIVE Class + Subject +
AcademicYear TeacherAssignment. Teacher Period/Annual, finalization,
publication, and revision controls are hidden. Parents are denied before raw
Grade or Result queries are enabled.

All query keys include current School. No payload contains School, User,
Teacher, role, permission, maximum score, coefficient, rules, or recipients as
authority. Foreign identifiers produce the same controlled unavailable states
as missing resources.

## Queries and invalidation

Grade matrix, Result list/type, and Result detail keys extend the existing
`['grades', schoolId, ...]` boundary. Grade save invalidates the Gradebook
matrix and all current-School Result queries without calculating anything.
Calculate, finalize, publish, and revise invalidate the exact Result type and
detail. No whole-cache clear is used by feature mutations; the Task 025 School
switch still clears the complete cache at the tenant boundary.

## Domain boundaries and accessibility

The feature calls no Homework, Attendance, CurriculumSubject mutation,
Notification creation, export, or Parent child-result API. Tables retain
semantic headers and horizontal scrolling. Grade controls have Student-aware
accessible names, validation errors are announced, dialogs retain the shared
focus/Escape behavior, and every status is textual.
