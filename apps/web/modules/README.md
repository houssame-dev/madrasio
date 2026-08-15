# `modules/`

Domain modules.

Each module owns its own:
- Domain entities, value objects, policies, services, events
- Application use cases, commands, queries
- Infrastructure repositories
- Presentation DTOs / mappers (where applicable)

Cross-module direct database writes are forbidden. Modules communicate via:
- Explicit application operations
- Approved contracts
- Domain events / outbox

The folders below exist as placeholders so the workspace structure already
matches the approved architecture. Their internal layout and behavior will
be implemented in dedicated later tasks.
