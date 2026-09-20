# Architecture Decision Records

This directory contains the architectural decisions that define the Madrasio.

An ADR records:

- The context behind a decision
- The decision itself
- Alternatives considered
- Consequences
- Constraints introduced by the decision

Architectural decisions should not be changed casually.

When a major architectural decision changes:

1. Review the existing ADR.
2. Document the reason for change.
3. Evaluate alternatives.
4. Evaluate migration impact.
5. Create a new ADR or supersede the previous one.
6. Update `CLAUDE.md`.
7. Update the relevant architecture documentation.
8. Add/update tests where necessary.

---

## ADR Status

Statuses used in this directory:

- `Proposed`
- `Accepted`
- `Superseded`
- `Deprecated`

Current V1 architecture decisions are primarily `Accepted`.

---

## Current ADRs

| ADR | Decision |
|---|---|
| ADR-001 | Modular Monolith |
| ADR-002 | Next.js Full-Stack Application |
| ADR-003 | Supabase PostgreSQL |
| ADR-004 | Drizzle ORM |
| ADR-005 | Supabase Auth |
| ADR-006 | Cloudflare R2 for File Storage |
| ADR-007 | School as Primary Tenant Boundary |
| ADR-008 | StudentEnrollment as Academic Enrollment Source of Truth |
| ADR-009 | TeacherAssignment as Teacher Scope Source of Truth |
| ADR-010 | Curriculum Versioning |
| ADR-011 | Versioned Grading Configuration |
| ADR-012 | Transactional Outbox |
| ADR-013 | Persisted Notifications as Source of Truth |
| ADR-014 | No Mandatory Realtime in V1 |
| ADR-015 | No Redis/BullMQ in Initial V1 |
| ADR-016 | Vercel for Development and Commercial Hosting Strategy |
| ADR-017 | REST API Versioned under `/api/v1` |
| ADR-018 | Shared UUID Between Supabase Auth User and Application User |
| ADR-019 | Application-Owned Canonical User Email Mapping |

---

## Important Rule

An ADR does not replace `CLAUDE.md`.

`CLAUDE.md` contains the operational rules Claude Code must follow.

ADRs explain why those rules and architectural decisions exist.
