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

## `patternSampleRetries`, and a corrected assumption

This spec originally said retries could not be tested because provoking budget exhaustion would be
*probabilistic and flaky*. **That reasoning was wrong.** Measured against the real resolver, the
retry budget has no observable effect that can be provoked at all: the sample generator either
models a construct — and fills the pool on the FIRST attempt, at any budget — or cannot parse it,
and then fails at every budget. Length bounds, backreferences, lookaheads, `allowedChars` and
`disallowedValues` were each tried at budget 1 versus budget 200; none is budget-sensitive. The
generator is markedly more capable than FMT005's wording suggests.

So the failure mode the flakiness argument was built on does not appear to be reachable, and no
amount of retry tuning would have made it deterministic.

What IS observable is that the value reaches the resolver, which rejects anything below 1
(`invalid pattern-sample-retries 0 (want >= 1)`). That complaint goes to the resolver process's own
stderr — an inherited fd, not capturable in-process through vite's logger — so the test rides on
the CONTRAST instead: the same fixture with `patternSampleRetries: 0` fails and with `1` builds
clean. Only the option differs, so the failure is attributable to it. Verified as a real guard:
deleting the passthrough line from `mionVitePlugin.ts` fails exactly this test
(`expected true to be false`) and no other.

This is a weaker claim than its siblings and the test says so in place: it guards the passthrough,
not the budget's effect on generation.
