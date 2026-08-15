# ADR-009: TeacherAssignment as the Teacher Scope Source of Truth

- Status: Accepted
- Date: 2026-08-15

## Context

Teachers need academic scope restrictions.

A Teacher may teach:

- Different classes
- Different subjects
- Different academic contexts

## Decision

TeacherAssignment is the only source of truth for teacher academic scope.

## Authorization

Teacher permissions require:

- appropriate role
- required permission
- matching TeacherAssignment
- valid School Context
- valid resource state

## Consequences

Teacher scope can change over time without rewriting historical academic records.

No alternate teacher-scope table should be introduced without a new architectural decision.