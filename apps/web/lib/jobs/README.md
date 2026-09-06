# `lib/jobs`

Machine-only HTTP job helpers. Both routes use exact Bearer authentication,
POST-only execution, bounded aggregate responses, and Task 048's redacting
structured logger. A zero-work completion is distinct from an invocation or
processor failure; database state remains authoritative.

Background execution boundary.

The runtime adapter is intentionally minimal in V1 (see ADR-015). Job handlers
must call application use cases; they must not reimplement business logic.
