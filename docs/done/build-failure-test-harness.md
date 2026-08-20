# Build-failure test harness — the pattern diagnostics are now guarded

**Status:** done
**Type:** test infrastructure
**Created:** 2026-08-20
**Shipped:** 2026-08-20, alongside
[ts-runtypes-0.12.0-upgrade.md](ts-runtypes-0.12.0-upgrade.md)

## Problem

mion had no way to assert that a build **fails** for the right reason. Every spec in the repo runs
inside an already-successful vite/vitest build, so a case whose whole point is a build-time error
could not be expressed: the error takes the test run down with it. Verified at the time — no spec
anywhere imported vite's `build`/`createServer`, and there was no fixture-build helper.

That left the 0.12.0 pattern sidecar's failure paths unguarded.
[patternSidecar.spec.ts](../../packages/devtools/src/vite-plugin/patternSidecar.spec.ts) covered
the success half; nothing proved the failure half still fired. Those diagnostics are the entire
safety argument for having removed `allowUncheckedPatterns` — whose job was precisely to let
patterns ship unverified — so a regression that quietly stopped them failing closed would have put
mion back to that behaviour with no flag and no warning.

## What shipped

[`packages/devtools/src/vite-plugin/buildFailure.spec.ts`](../../packages/devtools/src/vite-plugin/buildFailure.spec.ts)
plus fixtures under `packages/devtools/test-fixtures/`.

`buildFixture(name, runTypes?)` runs one fixture through a **real vite build** with the mion plugin
and reports `{ok, codes, messages}` instead of throwing. The real-build route was chosen over
driving the resolver binary directly: it is slower, but it exercises the actual
`mionVitePlugin` → `@ts-runtypes/devtools` path, which is the thing under test.

**Diagnostics arrive as plugin WARNINGS**, via upstream's `ctx.warn`. The thrown error is only the
generic `"N unsupported-type errors — build halted"` summary and carries no code, so the harness
installs a custom vite logger and scrapes `FMT\d{3}` out of the captured messages. Assertions are on
the **code**, never message text — upstream headlines interpolate values and will drift.

| Test | Fixture | Asserts |
| --- | --- | --- |
| positive control | `ok` | builds clean, no FMT codes |
| FMT003 | `fmt003` | `mockSamples: ['b','bb']` against `minLength: 5` |
| FMT005 | `fmt005` | lookaround pattern, no declared samples, generator cannot handle it |
| FMT005 | `ok` + `patternSampleCount: 0` | generation disabled reaches the same diagnostic |
| FMT006 | `fmt006` | two sites, one cache entry, different pools |
| passthrough | `ok` + `patternSampleRetries: 0` vs `1` | resolver rejects < 1; contrast attributes the failure |

Two design points worth keeping:

- **The positive control runs first and matters.** Without it "the build failed" proves nothing — a
  typo in any fixture would fail identically and every negative case would pass for the wrong
  reason.
- **`test-fixtures/` is excluded from `packages/devtools/tsconfig.json`.** The fixtures hold
  deliberately broken types; inside the package program the resolver would scan them and devtools'
  own test run would fail with the very diagnostics they exist to provoke.

The `patternSampleCount: 0` case also closes a gap the sidecar spec could not: it proves the
passthrough is live in the **disabling** direction, complementing that spec's "pool has exactly N
entries" on the enabling side.

## Verified as real guards

Repairing the FMT003 fixture (`minLength: 5` → `1`) fails exactly its own test with
`expected [] to include 'FMT003'`, and no other. The suite went 46 files / 687 tests → **47 / 693**.

## `patternSampleRetries` — forwarded, not behaviourally tested

**Decided, not deferred — there is no follow-up todo for this.**

`patternSampleRetries` drives a redraw loop inside the sample generator, for a regex that parses but
whose draws keep failing the surrounding constraints. That loop is a third-party generator's
internal behaviour, which upstream does not test itself, so mion does not assert on it either.

Note the two arms of FMT005 are not the same thing: an **unparseable** regex (the `fmt005` fixture)
errors immediately and never enters the loop — the same ~280ms at retries 1, 50 and 500 — while a
parseable one with failing draws is what the budget actually governs. The first arm is a real
scenario and is tested; the second is upstream's.

What mion owns is that the option is FORWARDED, and that is what the test pins: the resolver rejects
anything below 1 (`invalid pattern-sample-retries 0 (want >= 1)`), complaining on its own stderr
rather than through vite's logger, so the assertion rides on the contrast — same fixture with `0`
fails and with `1` builds clean. Verified as a real guard: deleting the passthrough line from
`mionVitePlugin.ts` fails exactly this test and no other.
