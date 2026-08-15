# ADR-008: StudentEnrollment as the Academic Placement Source of Truth

- Status: Accepted
- Date: 2026-08-15

## Context

Students may move between classes and academic contexts over time.

A single mutable `class_id` on Student cannot preserve academic history correctly.

## Decision

Use StudentEnrollment as the source of truth for academic enrollment history.

Enrollment records preserve:

- Student
- Class
- Academic Year
- Enrollment lifecycle
- Transfer history

## Consequences

Student transfers become explicit business operations.

Historical enrollment remains queryable.

Current class membership is derived from enrollment state rather than a mutable Student field.

## Constraint

Do not introduce a second source of truth for historical Student/Class placement.