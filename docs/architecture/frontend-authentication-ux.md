# Frontend Authentication UX

> Task 038 — login, logout, and expired-session behavior for the Phase 3 app shell.

## Authority and boundaries

Supabase Auth remains the only authentication authority. The browser login form
submits only email and password to `signInWithPassword`; it never derives an
application role, membership, permission, User id, or School context. After
sign-in, navigation enters the existing `/me` bootstrap, which resolves the
application User and current School from server-owned data.

The protected `app/(app)` route group remains consistently wrapped by
`AppBootstrap`. It renders no protected shell or page content until `/me`
succeeds. No middleware or parallel authorization system is introduced:
middleware is not a permission boundary, and every protected API continues to
use the authoritative server pipeline.

## Login contract

`/login` is a public Server Component route with an accessible email/password
form. A server-side Supabase user check redirects an already-authenticated
visitor to `/dashboard`. The form uses React Hook Form and Zod, includes
email/current-password autocomplete metadata, prevents repeated submission,
and maps provider failures to controlled copy rather than rendering raw
Supabase text.

A successful sign-in clears the complete TanStack Query cache, replaces the
route with `/dashboard`, and refreshes the App Router. The `/me` bootstrap then
selects the correct UX state: app shell, School selection, no membership,
inactive User, or provisioning failure. Task 038 deliberately adds no return
URL parameter, so there is no user-controlled redirect target or open-redirect
surface.

## Canonical logout contract

`POST /api/v1/auth/logout` is the only application logout endpoint. It:

1. calls local Supabase server sign-out through the request-scoped cookie adapter;
2. clears the HTTP-only `sms_current_school` selector using the exact cookie attributes and `maxAge: 0`; and
3. returns `{ "data": { "signedOut": true } }` only when both operations complete.

The school selector is cleared even when Supabase reports a sign-out failure,
but the endpoint still returns a controlled error and does not pretend logout
succeeded. The client only clears its whole QueryClient, replaces the route
with `/login`, and refreshes after a successful server response. On failure it
keeps the current screen/cache and displays retryable controlled feedback.
There is no GET logout route and no client-only cookie manipulation.

Logout is available in the authenticated shell, multi-School selection, no
ACTIVE membership, inactive User, and application-User provisioning states.

## Expired and stale sessions

An unauthenticated (401) response from the central `/me` bootstrap is a safe
session-loss signal. The bootstrap renders no protected content, clears the
entire query cache, redirects to `/login`, and refreshes. This behavior is not
installed as an arbitrary global 401 interceptor because feature endpoints can
have different recovery semantics.

403 responses remain authenticated application states. They do not redirect to
login: inactive and unprovisioned users see controlled account-unavailable copy
plus logout. Zero ACTIVE memberships and multi-School selection likewise remain
distinct from unauthenticated state.

Supabase session cookies are shared by tabs. A second tab recovers when its
next `/me` bootstrap or server request observes the invalid session; Task 038
does not add BroadcastChannel/localStorage coordination or promise immediate
cross-tab UI replacement.

## Security, privacy, and accessibility

- Auth/session tokens remain HTTP-only and are never copied into application state.
- `sms_current_school` remains a selector, never authorization proof.
- Password values, provider error details, SQL details, and tokens are never logged or rendered.
- Login and logout use semantic forms/buttons, visible labels, keyboard focus styles, live status/error semantics, and pending-disabled controls.
- The implementation adds no schema change, migration, RLS, password reset, signup, MFA, impersonation, profile management, or new role.
