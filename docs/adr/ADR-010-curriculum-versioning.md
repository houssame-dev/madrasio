# ADR-010: Curriculum Versioning

- Status: Accepted
- Date: 2026-08-15

## Context

Curriculum configuration may change between academic years or within academic contexts.

Historical academic records must remain interpretable using the configuration that was actually in effect.

## Decision

Curriculum is versioned through CurriculumVersion.

Curriculum-specific Subject configuration belongs to CurriculumSubject.

## Consequences

Historical records reference appropriate curriculum/configuration versions.

Current changes do not rewrite historical academic meaning.