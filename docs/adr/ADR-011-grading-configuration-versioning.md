# ADR-011: Versioned Grading Configuration

- Status: Accepted
- Date: 2026-08-15

## Context

Schools may use different grading methods, and grading configurations may change over time.

Historical results must not change when current configuration changes.

## Decision

Use:

GradingConfiguration
+
GradingConfigurationVersion

Historical results must reference the appropriate version.

## Consequences

The application can evolve grading rules without rewriting past academic results.

Period Results and Annual Results remain separate domain concepts.