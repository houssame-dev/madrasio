# Frontend Attendance — session-based V1

`/attendance` defaults to Published sessions. Teachers choose a School-local date
and one of their own applicable published lessons, with Class, Subject and time
visible. There is no arbitrary Class/date recording form. The server resolves
Teacher identity, exact Assignment and dated enrollment; browser choices confer
no authority. A lesson cannot be edited before its start, after replacement on
the selected date, or without current authorized scope.

The selected session loads a paginated authoritative roster. Teachers may mark
Present/Absent/Late/Excused, optionally add a note, save atomically and correct an
existing row using its expected version. Missing remains unmarked. Mark unmarked
present changes local drafts only. The client never retries ambiguous saves.
Stale/denied saves retain edits and show localized reload/error guidance.

School Admins can browse all published sessions and Student history but have no
status inputs, bulk marking, editable notes or save actions. Legacy daily history
is an explicitly read-only Admin tab. Teachers cannot use the legacy daily PUT,
even by direct request. Grade, Result and Timetable publication permissions are
unchanged; Parents continue through My Children only.

Student and Parent histories distinguish preserved daily records from session
records with Subject and start/end labels. No daily record is synthesized from
multiple lessons, and no legacy row is assigned to an arbitrary session. Parent
DTOs omit staff identifiers and notes, preserving existing child isolation.

EN/FR/AR share aligned typed catalogs. School time is authoritative; dates and
clock ranges stay LTR inside the RTL layout and names use bidi isolation. Existing
responsive tables, status controls, buttons, labels, alerts and focus conventions
are reused. No new UI library or standard control was introduced.

Unsaved edits are protected on session/date/page/tab changes, link navigation and
full-document unload. A failed save keeps the draft. Loading, empty (no published
sessions), read-only, missing roster and retry states are explicit. Session and
history caches are School-scoped and invalidated after successful saves. School
switching still clears the QueryClient through the existing shell contract.
