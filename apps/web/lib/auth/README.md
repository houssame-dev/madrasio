# `lib/auth`

Supabase Auth integration boundary.

This folder owns:
- Session retrieval
- Cookie handling for SSR
- Current User identity

It does NOT own authorization decisions (role/scope/ownership). Authorization
lives in `lib/authorization/`.

Full authentication flows (login, recovery, registration) will be added in a
dedicated later task.
