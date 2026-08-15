# `@school/ui`

Shared UI primitives.

This package is intentionally **minimal** for V1. It ships:
- `Button` (shadcn/ui-style primitive) to prove the styling pipeline works
- `cn()` re-export from `@school/shared`

Do not add business-domain UI components here. Domain UI lives next to its
owning module under `apps/web/modules/<domain>/presentation/`.
