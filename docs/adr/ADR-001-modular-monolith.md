# ADR-001: Modular Monolith

- Status: Accepted
- Date: 2026-08-15

## Context

The School Management System is being developed by a solo developer as an early-stage SaaS MVP.

The product contains multiple domains:

- Students
- Teachers
- Parents
- Academic Structure
- Grades
- Attendance
- Homework
- Announcements
- Notifications

The system needs strong domain boundaries, but the initial deployment must remain inexpensive and operationally simple.

Introducing microservices would add:

- Multiple deployments
- Network communication
- Service discovery
- Distributed observability
- More infrastructure
- More failure modes
- Higher operational complexity

without a demonstrated V1 requirement.

## Decision

Use a Modular Monolith architecture.

All V1 modules run inside one Next.js application while maintaining logical boundaries between:

- Domain
- Application
- Infrastructure
- Presentation

Modules must not directly mutate another module's owned data.

## Alternatives Considered

### Microservices

Rejected for V1 because the operational cost and complexity are not justified by current scale.

### Separate NestJS Backend

Rejected for V1 because the project can provide its API and backend application layer through Next.js.

## Consequences

### Positive

- One deployment
- Lower cost
- Easier local development
- Easier debugging
- Simpler authentication flow
- Easier development for a solo developer
- Logical boundaries remain available for future extraction

### Negative

- The application must enforce strict module boundaries.
- A poorly structured monolith could become tightly coupled.
- Future extraction requires discipline.

## Constraints

Do not introduce microservices in V1 without a new architectural decision.