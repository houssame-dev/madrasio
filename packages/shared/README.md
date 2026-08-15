# `@school/shared`

Cross-cutting primitives shared by apps and packages.

Currently contains:
- `cn()` — Tailwind-aware className composer
- Locale constants and helpers (Arabic, French, English)

Do NOT put domain logic here. Module-specific code lives under
`apps/web/modules/<domain>/`.
