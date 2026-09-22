# `lib/errors`

Foundation for application errors.

This folder hosts the **generic** error categories documented in `PRD.md`
(VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, CONFLICT,
BUSINESS_RULE_VIOLATION, RATE_LIMITED, INTERNAL_ERROR).

Feature-specific codes (e.g. `GRADEBOOK_CLOSED`, `STUDENT_NOT_ENROLLED`,
`ANNOUNCEMENT_ALREADY_PUBLISHED`) will be added inside their owning module
folders when those modules are implemented.
