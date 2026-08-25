# Frontend Academic Structure

## Scope

The `/academic` workspace is the Phase 3 management surface for Academic Years, Academic Periods, Stages, Levels, Tracks, Subjects, Curricula, Curriculum Versions, Curriculum Subjects, and Classes. It consumes the committed `/api/v1` contracts; it does not introduce a second domain model or change persistence.

## Route and navigation

Academic Structure remains a single protected workspace at `/academic`. A section switcher keeps the ten resources navigable without turning every resource into an unrelated top-level route. The active section, page, status, and subject search are URL-backed so refresh and browser navigation preserve useful list state. Academic Periods are opened from an exact Academic Year, Curriculum Versions from an exact Curriculum, and Curriculum Subjects from an exact Version.

## School context and permissions

The workspace uses the authenticated current School from the application shell. It never submits a `schoolId`. Query keys include the current School id only to isolate browser cache entries when context changes; the server remains authoritative.

- `SCHOOL_ADMIN` receives read and management controls.
- `TEACHER` receives the committed read-only workspace and no mutation controls.
- `PARENT` and roles without `academic_structure.read` receive the shared access-denied state.

These checks improve the interface but do not replace API authorization.

## Data access and cache policy

Academic API calls live in `lib/frontend/academic`. List calls preserve the server `{ data, meta }` envelope and use bounded `page`/`pageSize` parameters. Selector helpers traverse every bounded API page instead of assuming that the first page is complete. Query keys are resource-specific and School-scoped. Successful mutations invalidate the affected list or nested resource prefix; there are no optimistic writes for lifecycle or historical records.

## Forms and validation

Forms use React Hook Form, Zod, and the committed server contract schemas. Client validation covers required names, calendar date ordering, Year-contained Period dates, non-negative ordering, UUID-backed relations, and positive decimal coefficients. Server validation remains authoritative. Safe feature-code messages and field validation details are mapped into inline form feedback; raw SQL or internal server details are not displayed.

## Lifecycle interactions

The UI exposes only committed forward transitions:

- Academic Year: `PLANNED -> ACTIVE -> CLOSED -> ARCHIVED`
- Academic Period: `PLANNED -> ACTIVE -> CLOSED`
- Stage, Level, Track, Subject, and Curriculum Subject: `ACTIVE <-> INACTIVE`
- Curriculum: `ACTIVE <-> INACTIVE`, then `ARCHIVED`
- Curriculum Version: `DRAFT -> ACTIVE` or `ARCHIVED`; `ACTIVE -> ARCHIVED`
- Class: `ACTIVE -> CLOSED -> ARCHIVED`

High-impact transitions use a confirmation dialog that names the target status and states that history is retained. There are no delete actions.

## Historical safety

Academic Year and Period dates become read-only after `PLANNED`. The UI also explains that the server may reject a planned-date edit once dependent data exists. A Class's Academic Year is selectable only during creation and is rendered as immutable context during editing. Curriculum Version names and structural Curriculum Subject changes are editable only while the Version is `DRAFT`; active and archived versions remain readable.

## Curriculum version selectors

Class creation loads all Curriculum pages and then all Version pages for those curricula. Options display both Curriculum and Version names and preserve server identities. The client never invents or submits a version number because version allocation belongs to the server.

## Coefficient source of truth

Subject forms contain only name and optional code. Coefficients appear exclusively on Curriculum Subject forms nested under a Curriculum Version, are submitted using the committed decimal contract, and must be greater than zero. Already attached Subjects are excluded across the complete paginated attachment set.

## Pagination, filtering, and sorting

Administrative tables use the API's deterministic ordering and metadata. Page size stays bounded at 50 for visible tables and 100 per request for complete selector traversal. Status filters are provided for lifecycle resources, Subjects support bounded name/code search, Levels support Stage filtering, and Classes support Academic Year filtering. The UI does not implement a generic query language or re-sort authoritative results inconsistently.

## Accessibility and responsive behavior

Tables retain semantic headers inside horizontal overflow containers on narrow screens. Forms use explicit labels and inline alert feedback. Modals expose dialog semantics, trap focus, close on Escape, and restore focus to the opener. Loading skeletons, empty states, retry states, disabled pending actions, and keyboard-accessible controls are shared across sections.

## Localization readiness

Academic workspace copy is centralized in `lib/frontend/academic/copy.ts`. The current release ships English strings, with labels and descriptive copy separated from resource behavior so a later translation provider can replace the catalog without changing API or form logic.

## Testing boundary

Focused component tests cover permissions, tenant-safe payloads, URL/API contracts, lifecycle affordances, validation, nested resource selection, paginated selector traversal, coefficient placement, immutable historical fields, controlled errors, loading/empty states, and representative create/edit flows. Backend behavior remains covered by the existing Application/API suites.

## Deferred UX enhancements

Authenticated browser CRUD scenarios remain deferred until the project has a reusable signed-in Playwright fixture. Bulk import, bulk creation, drag-and-drop ordering, destructive delete, a global "current" Academic Year, and cross-module workflow screens are intentionally outside this workspace. A future localization provider can consume the existing copy catalog when Phase 3 language switching is introduced.
