# `lib/config`

Environment variable parsing.

Validates required environment variables using Zod at startup so misconfiguration
fails fast. Provides a typed `env` object.

Server-only secrets (Supabase service role, R2 credentials, etc.) live in this
folder and are **never** exposed to client code.
