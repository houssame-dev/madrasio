# `lib/supabase`

Supabase client factories.

Exports:
- `getServerSupabase()` — request-scoped server client with cookie awareness.
- `getBrowserSupabase()` — browser client using public anon key only.

The service-role key is **never** exposed to client code.
