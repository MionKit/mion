---
type: chore
spec: guidelines
status: done
created: 2026-07-30
completed: 2026-08-01
---

# Serialization suites have no StringTime / StringDateTime cases

Found while double-checking string-datetime coverage across the suites: the
string-datetime FORMAT brands are fully covered on the validation side but
only one of the three had a serialization case.

## Coverage gap (verified 2026-07-30, still true at implementation)

- [format-validation/StringFormat.ts](../../packages/ts-runtypes/test/suites/format-validation/StringFormat.ts)
  has 12 string-datetime cases: ISO date/time/dateTime plus the custom
  layouts and min/max variants.
- [format-serialization/StringFormat.ts](../../packages/ts-runtypes/test/suites/format-serialization/StringFormat.ts)
  had ONE string-datetime case ("String date"). There was NO "String time" and
  NO "String dateTime" serialization case in any group, so their round-trip
  behaviour was covered only transitively (the validation suite exercises the
  brands), never by a direct byte-identity round-trip case.
- The DATETIME-named suites are entirely native Date + Temporal instance
  cases (32 validation + 7 serialization), so they could not close this gap.

## What shipped

Two cases added to the existing `STRING_FORMAT` group in
`format-serialization/StringFormat.ts` (per the serialization CLAUDE.md,
prefer an existing group), placed next to the sibling `date` case:

- `time` — "String time ISO" over `TF.StringTime`, samples
  `['12:30:45Z', '12:30:45.123Z', '00:00:00-08:00']` (bare `Z`, millisecond
  form, negative offset).
- `dateTime` — "String dateTime default" over `TF.StringDateTime`, samples
  `['2024-02-29T12:30:45Z', '2026-05-28T00:00:00.500+02:00']` (leap day at
  `Z`, millisecond form at a positive offset).

Both mirror the existing "String date" case's shape: self-contained thunks,
inline types, every column filled (mutate / clone / direct / compact
encoders, strip / preserve / compact decoders, binary encoder + decoder, and
all four `schema*` value-first variants). The `serializeNotes` record that the
layout brands are validation-only, so the offset and millisecond text survives
verbatim with no normalization to UTC.

Sample values were taken from the corresponding validation cases (`time_iso`,
`dateTime_default`) so the two suites agree on what a valid value looks like.

## Verified

- `format-serialization/StringFormat.test.ts`: 70 to 90 tests, all green. Each
  new case runs all 10 columns.
- `id-integrity/serializers.test.ts`: 187 green. The id-integrity serializer
  driver picked both cases up automatically, as expected for an existing group.
- No new group means no wiring needed in `index.ts`, the bench data generator,
  or the `BenchTable` component.

## Done when

- [x] Both cases exist with every column filled (all three brands are
      serializable strings).
- [x] `pnpm test` green, including byte-identity round-trips for the new cases.
