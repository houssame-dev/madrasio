# ADR-015: Defer Redis/BullMQ in Initial V1

- Status: Accepted
- Date: 2026-08-15

## Context

The MVP is being developed by a solo developer with a strong requirement for low infrastructure cost.

The initial expected scale is small.

## Decision

Do not introduce Redis/BullMQ at project bootstrap.

Use simpler scheduled/background execution mechanisms first.

Application Use Cases must remain independent of the job execution mechanism.

## Trigger for Change

Introduce Redis/BullMQ only when actual requirements justify it, such as:

- large notification workloads
- long-running asynchronous processing
- high job volume
- queue prioritization
- retry workloads exceeding simple scheduling