# `lib/audit`

Server-only important-action persistence boundary (Task 054). AuditEvent supplements
domain snapshots/history and the transactional outbox; it replaces neither.

## Initial inventory

| Action | Resource | Strict semantic metadata |
| --- | --- | --- |
| `ClassCurriculumChanged` | Class UUID | previous/new CurriculumVersion UUID |
| `CurriculumVersionStatusChanged` | CurriculumVersion UUID | previous/new lifecycle status |
| `AccountRecoveryRequested` | User UUID | Teacher/Parent profile kind and UUID; CONFIRMED/UNCONFIRMED identity state |

These existing academic administration operations demonstrate historical configuration
accountability without blanket CRUD logging. No-op/name-only edits emit nothing.
Creation directly in a non-DRAFT state records its DRAFT-to-requested transition in
the creation transaction. Task 053 historical-binding restrictions remain intact.
Other modules must add a reviewed action, metadata schema and permission mapping
before claiming coverage; result/publication histories are not retroactively audited.

## Attribution and authorization

`recordSchoolAudit` receives the existing server-resolved application actor and a
transaction, never request authority. The action inventory is a strict discriminated
union; clients cannot submit actor, School, arbitrary action, or unrestricted JSON.
The initial actions require `academic_structure.manage`. Resource type is derived
from action, and occurrence time/identity use database defaults.

Task 057 recovery intent requires `teachers.manage` or `parents.manage`, derived
from the server-selected profile kind. The recovery service validates current-School
profile/membership and exact Auth identity first. It rechecks application eligibility
under the User lock, commits the intent, then requests external email delivery.
The event proves an authorized attempt, NOT successful delivery/reset. Audit failure
prevents delivery; delivery uncertainty retains intent and its 60-second cooldown.
There is no external-operation rollback, automatic resend or identity mutation.
See `docs/architecture/safe-account-recovery.md` for the non-atomic boundary.

SCHOOL events require School ID. PLATFORM events forbid School ID. USER events
require an application User and forbid a system code; SYSTEM events require a bounded
explicit system code and forbid a User. A composite School/User membership FK
preserves tenant attribution. Reference deletion is restricted, not cascaded.
Platform/system representation is storage-ready only: no generic producer, platform
reader, fake service account or blanket SUPER_ADMIN bypass is introduced here.

`readSchoolAudit` requires active current-School authority and `audit.read` (School
admin, or the existing permitted SuperAdmin membership model). Teacher/Parent have
no grant. It queries SCHOOL rows for that School only, ordered by timestamp then UUID
descending; page size is 1–100 and page is 1–10000. No UI or generic audit API exists.

## Atomicity, privacy and append-only history

Business mutation and audit insert use the same transaction. Failure rolls back both
and returns the generic `AUDIT_PERSISTENCE_FAILED` application error without raw SQL,
payload or underlying cause. Row locking serializes lifecycle transitions; existing
Class transaction/locking rules are preserved.

Normal application repositories expose append and scoped read only: no edit/delete.
This is not an owner-proof immutable ledger; privileged database maintenance remains
outside the normal application boundary. There is no trigger framework.

Metadata accepts only the UUIDs/enums above, rejects unknown keys, and has an additional
database object/1024-byte ceiling. Never add passwords, tokens, cookies, private keys,
headers, uploaded contents, request bodies or entire before/after objects. Future
actions need deliberately bounded semantic contracts, not arbitrary text logging.

## Migration and recovery

`0016_audit-events` adds one RLS-enabled application table, two attribution enums,
constraints/indexes and explicit deny-by-default API-role grants. It performs no
historical backfill and does not modify Auth tables. Fresh replay and populated
upgrade are covered locally.

Current inventory becomes 17 migrations, 40 application tables and 42 recovery tables
(the same two Auth tables plus all application tables). `audit_events` participates
in fingerprints, archive inventory and FK-derived restore ordering after its actor,
School and membership dependencies. `madrasio-recovery-v1` and Auth taxonomy do not
change. An older 41-table backup must be restored using its matching repository
revision, not the newer inventory. Future deployment/backup runners must use the
matching schema revision; mismatches continue to fail closed. No hosted migration,
backup or restore acceptance is claimed by this local task.
