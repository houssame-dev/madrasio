# Shared accessible management UX (Task 056)

## Fields and feedback

The existing academic `Field` is the shared management field wrapper. Its
`htmlFor` must match the native child control's unique `id`. It preserves the
React Hook Form ref and handlers, merges existing descriptions with stable
helper/error IDs, sets `aria-invalid` when an error exists, and conveys required
state through `required` on the wrapper or control. Helper and error text coexist.
Errors remain visible; they are not communicated by color alone. RHF's existing
failed-submit first-invalid focus remains enabled. Academic server validation
focuses only the first mapped issue. Typing does not cause focus movement.
Field errors use description associations rather than competing alert regions.

`InlineFeedback` supports success/status, warning/status and error/alert with
atomic announcements. It has no timer: persistent business state remains
persistent. `useSuccessFeedback` is an opt-in action-acknowledgement timer:
four seconds, latest message wins, repeated messages renew the deadline,
unmount cancels the timer, and focus is never moved.

Transient acknowledgement consumers: academic Years/Periods, Structure,
Tracks, Subjects, Classes, Curricula/Versions/Subjects; Student, Teacher and
Parent lists and details. Errors and warnings remain outside this hook;
Homework's persisted REVIEWED state is deliberately unchanged.

## Search

`SearchInput` owns draft input and a 350ms server-search debounce. Enter submits
immediately, Clear cancels pending input and clears immediately, and externally
changed query values restore the draft (including URL navigation). The local
mode is immediate and is intended only for complete locally loaded datasets.
Requests and pagination remain owned by the consumer, not the input.

Subjects, Classes and Curricula are paginated server lists. Subjects retains
name/code matching. Classes and Curricula add name-only matching, bounded to
100 characters at the HTTP boundary, with literal wildcard escaping and the
existing tenant conditions applied to both rows and total counts. No Class
code exists. Status and Class Academic Year filters continue to compose.
Academic URL search changes reset page to 1; nested version lists are unchanged.
Existing Student/Teacher/Parent server searches also reuse the shared control.

TanStack Query keys include School and the full settled filter/page set. No
previous-query placeholder data is used: a late response can fill its old cache
entry but cannot replace the active query. Loading text is not a live region,
avoiding per-keystroke announcements. Existing empty-state and retry UI remains.
No search was added to Years, Periods, Stages, Levels, Tracks or nested Versions.

## Width, not padding

`PageContainer` owns responsive `w-full min-w-0 mx-auto` and these widths:

- `MANAGEMENT_WIDE`: `max-w-[110rem]` — Academic Structure, Attendance,
  Homework, Gradebook Setup, Students, Teachers and Parents workspaces.
- `FORM_DETAIL`: `max-w-6xl` — Student, Teacher, Parent and Announcement
  management details (the Announcement detail includes management tables).
- `READING_CONTENT`: `max-w-3xl` — Notification inbox/reading workspace.

The shared shell continues to own `--app-page-padding`. Container variants add
no padding and no hard minimum width; existing table overflow remains intact.
This is not the full mobile/RTL remediation. New management strings follow the
current module-level copy convention; Task 066 still owns localization rollout.

No new dependencies, migrations, persistent schema, authorization model,
domain lifecycle, or provider configuration is introduced.
