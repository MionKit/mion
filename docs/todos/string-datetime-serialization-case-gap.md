---
type: chore
spec: guidelines
status: ready
created: 2026-07-30
---

# Serialization suites have no StringTime / StringDateTime cases

Found while double-checking datetime coverage of the jsonSchema column: the
string-datetime FORMAT brands are fully covered on the validation side but
only one of the three has a serialization case.

## Current coverage (verified 2026-07-30)

- [format-validation/StringFormat.ts](../../packages/ts-runtypes/test/suites/format-validation/StringFormat.ts)
  has 12 string-datetime cases: ISO date/time/dateTime (jsonSchema column
  FILLED via `format: 'date' | 'time' | 'date-time'`, converging with the
  bare ISO `TF.StringDate/StringTime/StringDateTime` twins) plus the custom
  layouts and min/max variants (jsonSchema `'not-supported'` with notes —
  draft 2020-12 core has no keywords for custom layouts or string-date
  bounds).
- [format-serialization/StringFormat.ts](../../packages/ts-runtypes/test/suites/format-serialization/StringFormat.ts)
  has ONE string-datetime case ("String date", all four columns incl.
  jsonSchema filled). There is NO "String time" and NO "String dateTime"
  serialization case in any group — so their round-trip behaviour is covered
  only transitively (id convergence proves the jsonSchema form shares the
  type-first factory, and the validation suite exercises the brands), never
  by a direct byte-identity round-trip case.
- The DATETIME-named suites are entirely native Date + Temporal instance
  cases (32 validation + 7 serialization) — correctly `'not-supported'` for
  jsonSchema (instance types have no schema INPUT spelling; recorded in the
  `SchemaStoryByFormatName` totality map).

Note this is NOT a jsonSchema-column gap: the type-first / value-first
serialization columns are missing those two cases too — the case rows simply
do not exist.

## Fix direction

Add two cases to `format-serialization/StringFormat.ts` (the existing group —
per the serialization CLAUDE.md, prefer an existing group):

- "String time ISO" over `TF.StringTime` — all columns, jsonSchema thunks via
  `jsonSchema({type: 'string', format: 'time'})`.
- "String dateTime default" over `TF.StringDateTime` — same via
  `format: 'date-time'`.

Mirror the existing "String date" case's shape (self-contained thunks, inline
types, test data with valid ISO strings). The id-integrity serializer driver
and the jsonSchema driver pick both up automatically.

## Done when

- Both cases exist with every column filled (no `'not-supported'` — all three
  brands are serializable strings).
- `pnpm test` green; the jsonSchema id-integrity driver shows byte-identical
  output for the new thunks against their type-first twins.
