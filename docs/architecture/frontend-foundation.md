# Frontend Foundation and App Shell

> Task 025 — shared Phase 3 presentation and browser data foundation.

## Routes and shell

The root route redirects to `/dashboard`. The authenticated route group
`app/(app)` owns one client bootstrap and shell for these stable frontend URLs:

- `/dashboard`
- `/academic`
- `/students`
- `/children`
- `/teachers`
- `/parents`
- `/grades`
- `/attendance`
- `/homework`
- `/announcements`
- `/notifications`

Only Dashboard is a foundation landing page. The other routes are deliberately
small access-aware placeholders; their management and workflow screens remain
deferred to later Phase 3 tasks.

After bootstrap, `AppShell` composes a collapsible desktop sidebar, sticky
topbar, responsive main area, and keyboard-operable mobile navigation dialog.
Layout dimensions and page padding use CSS theme variables in `globals.css`.
Existing light/dark color tokens are respected; Task 025 does not introduce a
new theme preference mechanism.

## Authoritative `/me` bootstrap

The browser obtains identity, ACTIVE memberships, current School, and current
membership role only from `GET /api/v1/me` through `useCurrentUser`. It never
decodes a JWT or reconstructs CurrentContext from cookies. The stable query key
is `['me']`.

Bootstrap distinguishes loading, unauthenticated (401), inactive/provisioning
or authorization failure (403), transient failures, no ACTIVE membership,
School-selection-required, and a valid current School. Protected shell content
is not rendered while the query is pending. The repository has no login route,
so an unauthenticated user receives a controlled state instead of an invented
redirect. There is likewise no safe complete logout flow: Supabase sign-out
alone would leave the server-managed current-School selector unless a server
endpoint also clears it, so logout remains deferred.

## Current School switching and cache safety

Selection UI displays only ACTIVE memberships returned by `/me`; it contains no
free-form School identifier input. It calls `POST /api/v1/me/current-school`
and never writes the HTTP-only selector cookie.

A successful switch is treated as a tenant-boundary event:

1. `clearCacheForSchoolSwitch` clears the entire `QueryClient` cache;
2. `/me` is fetched again from the authoritative server;
3. navigation returns to `/dashboard`; and
4. the App Router is refreshed.

Clearing is conservative and appropriate while the frontend is small. It
guarantees School A feature data cannot be reused after switching to School B.
A failed switch performs none of those steps and preserves the safe previous
context. Future school-scoped keys use `queryKeys.feature(feature, schoolId,
...)`; parent-child data must additionally include the selected Student id.

## Navigation and presentation permissions

One `navigationItems` configuration owns labels, URLs, icons, optional roles,
and required permissions. Visibility uses the committed
`roleHasPermission`/`ROLE_PERMISSIONS` implementation through `can`, `canAny`,
and `canAll`; no second permission table exists. Direct placeholder navigation
also renders a controlled access-denied state when its role/permission
presentation policy fails.

These checks are UX only. They hide irrelevant links and obvious unavailable
routes, but every API request still relies on the server's complete
authentication, membership, School Context, permission, academic scope,
relationship, ownership, and resource-state authorization pipeline.
SUPER_ADMIN remains current-School membership scoped and has no global console.

## Browser API and TanStack Query conventions

`apiRequest` is the single browser transport baseline. It uses relative
`/api/v1` URLs, same-origin cookies, JSON, and no manually copied bearer token.
`ApiClientError` preserves HTTP status, generic code, optional feature code,
safe message, and validation details. Non-JSON and server-error responses use
a generic fallback so database/internal text is not displayed.

The shared QueryClient uses a 30-second default stale time, disables focus
refetch, never retries client/authorization/validation failures, retries a
transient/server query once, and does not retry mutations. Feature hooks should
declare query options and keys beside their data adapter and should handle
mutation success/error explicitly rather than relying on global toasts.

## Shared interface states and accessibility

Reusable states cover page and inline loading, empty content, controlled API
failure with optional retry, access denied, and no current School. The shell
uses semantic `header`, `nav`, `aside`, and `main` regions, visible focus rings,
labels for icon-only controls, `aria-current` active links, status/alert live
semantics, Escape dismissal, initial close-button focus for the mobile dialog,
and logical start/end CSS utilities suitable for future RTL activation.

User-facing foundation copy is centralized in `lib/frontend/copy.ts` so future
Arabic, French, and English catalogues can replace it without strings being
scattered through components. Locale routing and a locale preference control
are outside Task 025.

## Deferred feature work

Task 025 adds no Student, Teacher, Parent, Academic Structure, Gradebook,
Attendance, Homework, Announcement, or Notification feature UI; no backend API,
schema, migration, middleware, RLS, fake dashboard KPI, or alternate component
library is introduced.
