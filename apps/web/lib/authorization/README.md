# `lib/authorization`

Server-side authorization pipeline.

Implements the pipeline documented in CLAUDE.md:

```
Authenticated?
  → Active User?
  → School Membership?
  → School Context?
  → Role?
  → Permission?
  → Academic Scope?
  → Ownership / Relationship?
  → Resource State?
  → ALLOW / DENY
```

The pipeline is wired in the foundation, but concrete policies and permission
tables will be added inside each owning module.
