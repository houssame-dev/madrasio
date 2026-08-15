# `lib/db`

Database access boundary.

Exports a single `db` Drizzle client plus helpers. Drizzle-specific imports
must remain inside this folder — domain code uses repository interfaces defined
in each module's `infrastructure/` layer.

Business repositories will be added inside `modules/<domain>/infrastructure/`
once the corresponding domain schemas exist.
