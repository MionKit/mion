---
type: chore
spec: guidelines
status: ready
created: 2026-07-30
---

# Serialization suites have no StringTime / StringDateTime cases

Found while double-checking string-datetime coverage across the suites: the
string-datetime FORMAT brands are fully covered on the validation side but
only one of the three has a serialization case.

## Current coverage (verified 2026-07-30)

- [format-validation/StringFormat.ts](../../packages/ts-runtypes/test/suites/format-validation/StringFormat.ts)
  has 12 string-datetime cases: ISO date/time/dateTime plus the custom
  layouts and min/max variants.
- [format-serialization/StringFormat.ts](../../packages/ts-runtypes/test/suites/format-serialization/StringFormat.ts)
  has ONE string-datetime case ("String date"). There is NO "String time" and
  NO "String dateTime" serialization case in any group — so their round-trip
  behaviour is covered only transitively (the validation suite exercises the
  brands), never by a direct byte-identity round-trip case.
- The DATETIME-named suites are entirely native Date + Temporal instance
  cases (32 validation + 7 serialization), so they cannot close this gap.

The case rows simply do not exist: the gap spans every column of the
serialization suite, not any single authoring form.

## Fix direction

Add two cases to `format-serialization/StringFormat.ts` (the existing group —
per the serialization CLAUDE.md, prefer an existing group):

- "String time ISO" over `TF.StringTime` — all columns filled.
- "String dateTime default" over `TF.StringDateTime` — same.

Mirror the existing "String date" case's shape (self-contained thunks, inline
types, test data with valid ISO strings). The id-integrity serializer driver
picks both up automatically.

## Done when

- Both cases exist with every column filled (all three brands are
  serializable strings).
- `pnpm test` green, including byte-identity round-trips for the new cases.
