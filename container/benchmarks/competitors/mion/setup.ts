// The DATETIME cases' getSamples() build Temporal.PlainDate / PlainTime /
// ZonedDateTime / … values, reading globalThis.Temporal. The benchmark container
// runs Node >= 26, which ships Temporal natively, so no polyfill is installed —
// assert it's present so a misconfigured (pre-26) runtime fails loudly instead of
// producing NaN-laden samples. Imported first from main.ts, before any case runs.
// The DATETIME groups can legitimately be skipped on a runtime that has no
// Temporal at all: Bun 1.3.x does not implement it, and the bun lane declares that
// by listing DATETIME in RT_VALIDATION_BENCH_SKIP_GROUPS. When DATETIME IS in scope, a missing
// Temporal is still a hard error — on node it means a pre-26 runtime, which would
// produce NaN-laden samples rather than an honest failure.
const skipsDateTime = (process.env.RT_VALIDATION_BENCH_SKIP_GROUPS ?? '')
  .split(',')
  .some((group) => group.trim().toUpperCase() === 'DATETIME');
if (!skipsDateTime && typeof (globalThis as {Temporal?: unknown}).Temporal === 'undefined') {
  throw new Error(
    'Temporal global missing — the benchmarks require Node >= 26 (native Temporal, no polyfill). ' +
      'On a runtime without Temporal (e.g. Bun), run with RT_VALIDATION_BENCH_SKIP_GROUPS=DATETIME.'
  );
}
