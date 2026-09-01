# Frontend Parents and Relationships

## Routes, roles, and sources of truth

`/parents` is the current-School administrator directory and `/parents/[id]` contains Profile, Linked account, and Student relationship history. `SCHOOL_ADMIN` and membership-scoped `SUPER_ADMIN` manage these routes. `TEACHER` and `PARENT` are denied the administrator workspace.

`/children` is the minimal Parent self-service boundary. It calls only `GET /api/v1/me/parent-profiles`, which derives the authenticated User and current School on the server and returns every ACTIVE owned Parent profile with ACTIVE child relationships. It never calls the School-wide Parent directory or admin history endpoint. Multiple profiles, profiles without children, and no-profile results are normal states. Full child portal features remain deferred.

## Parent profile, account link, and lifecycle

Parent contains identity, optional code, optional application User link, and lifecycle status. ParentStudent is the only Parent-to-Student relationship source of truth. Neither side embeds children, enrollment, current Class, role, or relationship arrays.

Profile creation and editing never create relationships, accounts, memberships, or roles. Normal forms do not expose a User UUID. An unlinked ACTIVE profile has a separate email-based `Invite account` action; the server verifies or creates the identity and derives the PARENT membership for the current School. Detail displays only linked/unlinked state and no authentication internals.

The lifecycle is `ACTIVE -> INACTIVE`, `INACTIVE -> ACTIVE/ARCHIVED`, with `ARCHIVED` terminal. Deactivate and archive require confirmation. An INACTIVE profile contributes no current child access, but relationship rows are not automatically ended or deleted.

## Relationship administration and history

Administrator history shows ACTIVE and ENDED ParentStudent rows separately from Parent status. The committed history DTO contains Student identifiers rather than embedded identity, so only the visible paginated rows resolve names through tenant-safe Student detail queries; the Parent directory itself has no relationship N+1 queries.

Linking submits only `studentId`. The selector uses bounded server pagination and search, allows ACTIVE/INACTIVE Students, and excludes WITHDRAWN/ARCHIVED options on the returned page. The complete ACTIVE relationship set prevents an obvious duplicate before POST; the server remains authoritative for concurrency, lifecycle, and tenant rules.

Ending uses the dedicated idempotent endpoint with an empty body. The relationship remains ENDED in administrator history and disappears from future `/me/parent-profiles` results. No Parent, Student, Enrollment, publication snapshot, Outbox recipient, Notification, Result, or other historical record is changed. Relinking is a new relationship rather than reactivating an old row.

## Data, cache, and tenant behavior

Parent query keys include current School and distinguish filtered lists, detail, history, complete ACTIVE relationships, and self profiles. Profile mutations invalidate detail/list and self bootstrap; relationship mutations invalidate history/detail and self bootstrap. Task 025 clears the whole browser query cache on School switch. No Parent or child data is persisted in Zustand or local storage.

All requests omit School authority. Server authentication, active User, membership, current School, permission, ownership, relationship, and lifecycle checks remain authoritative. Foreign identifiers render controlled unavailable states.

## Validation, accessibility, and deferred scope

React Hook Form and Zod validate exact profile and relationship payloads. Stable Parent feature codes map to safe messages without SQL or foreign-tenant details. Searchable selectors and tables are keyboard accessible, statuses are textual, dialogs trap/restore focus, tables scroll on narrow screens, and detail sections stack responsively.

Invitation resend, membership role administration, bulk import, current-Class inference, and a global Academic Year remain deferred. Account invitation/password activation is defined in `user-provisioning-invitations.md`; Parent portal operational views are documented separately.
