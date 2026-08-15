# ADR-007: School as the Primary Tenant Boundary

- Status: Accepted
- Date: 2026-08-15

## Context

The system is a multi-tenant SaaS.

School data must remain isolated between schools.

Users may potentially belong to more than one School.

## Decision

School is the primary tenant boundary.

School-scoped operations must resolve:

- User
- Active SchoolMembership
- Current School Context

before accessing data.

## Consequences

All school-scoped queries and mutations must be tenant-aware.

The system must prevent:

- Cross-school reads
- Cross-school writes
- Cross-school file access
- Cross-school notification leakage

## Database

Where appropriate, database constraints should reinforce tenant integrity.