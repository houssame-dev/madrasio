# `lib/`

Shared technical platform code for the Next.js application.

These folders exist to define **technical boundaries** only.
They must not contain business rules or domain logic. Business code
lives inside `modules/<domain>/`.

| Folder | Responsibility |
|---|---|
| `api/` | Thin HTTP adapters (Route Handlers, Server Actions glue). |
| `auth/` | Supabase Auth integration boundary. |
| `authorization/` | Authorization pipeline (Role, Permission, Scope, Ownership). |
| `config/` | Environment variable parsing and validation. |
| `context/` | Request / School Context resolution. |
| `db/` | Drizzle client and database access boundary. |
| `errors/` | Generic application error categories. |
| `events/` | Domain event / outbox foundation. |
| `audit/` | Audit event persistence boundary. |
| `files/` | File storage boundary (R2). |
| `jobs/` | Background execution boundary. |
| `observability/` | Logging / Sentry foundation. |
| `security/` | Security helpers (sanitization, headers). |
| `supabase/` | Server-side and browser Supabase clients. |

Each folder ships only the minimum surface required to prove the foundation
works. Business behavior is added inside the relevant `modules/<domain>/`
folder in dedicated later tasks.
