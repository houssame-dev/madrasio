# Frontend Gradebook and Assessment Setup

## Information architecture

`/grades` is the current-School Gradebook setup list. `/grades/[id]` is the exact Gradebook workspace containing an immutable context summary, one-way lifecycle controls, and the nested Assessment setup list. Grade entry, Result calculation/finalization/publication, Parent Results, and analytics remain outside this UI and are deferred to later tasks.

## Role behavior and backend authority

The UI consumes the committed `grades.read`, `grades.enter`, and `grades.manage` permissions only as presentation guidance. `SCHOOL_ADMIN` and current-School `SUPER_ADMIN` can manage Gradebooks and Assessments. A `TEACHER` sees the same list contract, whose SQL query is already limited by the backend to an ACTIVE Teacher profile and exact ACTIVE TeacherAssignment for Class + Subject + AcademicYear; the browser never loads a School-wide Gradebook set and filters it locally. A returned Teacher Gradebook exposes setup mutations, while every mutation is re-authorized against current exact scope. `PARENT` is denied raw Gradebook and Assessment administration.

## Exact Gradebook context and immutability

Every Gradebook displays its full committed identity: Academic Year, Academic Period, Class, Subject, and exact GradingConfigurationVersion. These fields are read-only after creation and are never submitted through PATCH. The UI keeps Gradebook and Assessment statuses separate and performs no cascading mutations.

## Gradebook creation and exact version discovery

Authorized School administrators and Teachers with `grades.enter` can open the Gradebook create form. Academic Year, Academic Period, Class, Subject, and GradingConfigurationVersion all require explicit selection; changing Year clears any stale Period and Class selection. The version selector traverses every bounded page of `/api/v1/grading-configuration-versions` and labels each exact option with its configuration name and version number. It never accepts a UUID input, automatically chooses the sole option, or describes any option as “latest,” “current,” recommended, or default.

Only versions eligible for new Gradebooks are returned: both the version and parent configuration must be ACTIVE in the current School. If discovery fails, the dialog presents a safe retry state. If the list is empty, it explains that no active version is available and provides no submit path. Gradebook creation remains authoritative on the server; a version made ineligible after discovery produces the controlled invalid-context message and refreshes the discovery query. Duplicate exact academic context produces the existing controlled conflict. Successful creation invalidates only the current-School Gradebook list boundary and opens the created Gradebook.

## Gradebook list and lifecycle

The Gradebook list uses the API's bounded page metadata and supported Year, Period, Class, Subject, and status filters. Changing Year clears Period and Class filters so incompatible context is not retained. Academic labels come from the existing Academic Structure queries, while Teacher Gradebook visibility remains server-scoped. The lifecycle exposes only `DRAFT -> OPEN -> CLOSED -> ARCHIVED`; each transition requires confirmation and ARCHIVED is terminal. Context is never editable.

## Assessment setup

The Gradebook detail calls the nested Assessment endpoint and displays title, committed type, maximum score, weight, optional date, and independent lifecycle status. Creation is offered only while the loaded Gradebook is DRAFT or OPEN and the separately loaded Academic Period is not CLOSED. DRAFT Assessments expose the supported edit fields. PUBLISHED and ARCHIVED structures are read-only. The server remains authoritative for races, current Teacher scope, existing-Grade dependency conflicts, and lifecycle state.

Assessment lifecycle controls expose `DRAFT -> PUBLISHED/ARCHIVED` and `PUBLISHED -> ARCHIVED`; ARCHIVED is terminal. Publishing confirmation explains that calculation-relevant settings become locked. Archive is historical and never deletes Grades.

## Decimal and date handling

`maximumScore` and `weight` remain strings from form input through the API adapter. The frontend validates the positive `numeric(6,2)` shape without rounding or floating-point formatting, preserving values such as `10`, `10.5`, and `12.25`. Weight is Assessment metadata and is never presented or submitted as a CurriculumSubject coefficient.

The optional Assessment date uses ISO calendar semantics. When provided, the client checks the inclusive loaded Period bounds; the backend repeats the authoritative validation. A separately CLOSED Period suppresses creation even if the Gradebook itself is otherwise mutable.

## Domain separation

This feature calls only Gradebook, Assessment, and read-only Academic Structure endpoints. It does not call Grade entry, Homework, Result, Subject mutation, Curriculum mutation, or coefficient APIs. The committed Assessment type `HOMEWORK` is labeled “Homework assessment” but creates no Homework relationship and does not weaken the domains' independence.

## Queries, cache, errors, and tenant isolation

Feature queries live under `lib/frontend/grades` and use keys beginning with `['grades', schoolId]`, followed by eligible configuration versions, Gradebook list/detail, or exact Gradebook Assessment identity. This School-keyed discovery cache cannot be reused for a different School; Task 025 also clears all cached data when School Context changes. Gradebook lifecycle invalidates its detail, relevant lists, and nested Assessment boundary. Assessment create/edit/lifecycle invalidates the exact nested list and Gradebook detail without clearing unrelated cache.

API payloads contain no `schoolId`, Teacher identity, role, permission, coefficient, grading rules, score, or Homework authority. Stable committed Gradebook feature codes map to safe UI messages. Foreign or out-of-scope resources render a generic unavailable state, and raw server/database text is not displayed.

## Accessibility and responsive behavior

Context-heavy tables retain semantic headers and horizontal scrolling on narrow screens. Detail sections stack responsively. Forms have explicit labels, numeric/date hints, inline errors, and visible status text. Confirmation and form dialogs reuse the shared focus trap, Escape handling, focus restoration, and viewport-safe scrolling behavior.

## Deferred Grade entry

Student rows, score editing, Grade APIs, calculations, Results, publication, and Parent grade consumption are explicitly deferred to Task 031 and later frontend tasks.
