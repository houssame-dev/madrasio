# `lib/context`

Request-scoped context resolution facade.

Implemented (Task 014 + Task 014.1):
- `requireCurrentContext(db)` — canonical protected-operation entry: session →
  application User → global User lifecycle (ACTIVE, Task 014.1) → ACTIVE
  membership → current School → role, returning the authorization foundation's
  `CurrentContext`.
- `resolveUserContext(db, { userId, selectedSchoolId })` — pure membership /
  current-school resolution (auto-select single membership, explicit selection,
  multiple-selection-required, zero-membership) including `userStatus`.
- `assertUserActive(resolution)` — enforces the Active User stage before any
  membership/role/permission/scope evaluation (USER_INACTIVE denial).
- Current-school cookie selector helpers (`current-school.ts`).

Authorization decisions (permission/scope/ownership) remain in
`lib/authorization/`; scope facts are resolved on demand.