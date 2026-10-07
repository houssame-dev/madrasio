# School business time

`school-time.ts` is the only Temporal implementation adapter. It imports the
exact pinned `temporal-polyfill@1.0.5` without installing globals. A future
native implementation can replace that import centrally; application modules
consume string-based helpers, not Temporal objects.

- `validateSchoolTimezone` accepts IANA zones (including existing `UTC`), not
  numeric offsets. Invalid configuration raises a bounded `SchoolTimeError`;
  there is no UTC/device/server fallback.
- `calendarDate` / `isCalendarDate` use strict ISO PlainDate semantics, with no
  timestamp conversion. Historical Attendance dates remain literal dates.
- `schoolDateFromInstant` derives the School calendar day from an explicit
  instant and zone.
- `schoolWallTimeToInstant` interprets local components in the School zone,
  rejects both gaps and folds, and returns a millisecond UTC string compatible
  with existing API contracts.
- `formatSchoolInstant` renders in the specified zone with a visible zone label.
  Changing presentation never changes the persisted instant.

Task 055 supplies current School timezone through authenticated `/me` context;
server domain checks independently load it from the database. Attendance uses
it for today; announcements use it for wall-time input and instant display;
Homework maps invalid timezone to its controlled context error without writes.
No School timezone-update API exists, so `SchoolTimezoneChanged` audit is
NOT_APPLICABLE. Task 054 audit behavior and database/recovery formats are unchanged.
