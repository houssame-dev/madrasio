# `lib/jobs`

Background execution boundary.

The runtime adapter is intentionally minimal in V1 (see ADR-015). Job handlers
must call application use cases; they must not reimplement business logic.
