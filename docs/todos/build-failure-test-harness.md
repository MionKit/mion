# No way to test that a build FAILS — FMT003/FMT005 negative cases are unguarded

**Status:** todo
**Type:** test infrastructure gap
**Created:** 2026-08-20
**Found while:** adopting the 0.12.0 pattern-sampling model
([../done/ts-runtypes-0.12.0-upgrade.md](../done/ts-runtypes-0.12.0-upgrade.md))

## Problem

mion has no way to assert that a build **fails** for the right reason. Every spec in the repo runs
inside an already-successful vite/vitest build, so a case whose whole point is a build-time error
cannot be expressed: the error would take the test run down with it.

Verified: no spec anywhere imports `vite`'s `build`/`createServer`, and there is no fixture-build
helper. This is a missing capability, not an oversight in one spec.

## What is currently unguarded

The 0.12.0 pattern sidecar's failure paths, all of which are `error` severity and therefore halt a
consumer's build:

- **FMT003** — a declared `mockSample` violates a sibling constraint (length / minLength /
  maxLength, allowedChars / disallowedChars / disallowedValues).
- **FMT005** — sample generation produced nothing: `patternSampleCount` is 0, the generator cannot
  handle a construct (lookarounds are the named case), or the
  `patternSampleCount × patternSampleRetries` budget was exhausted.
- **FMT006** — two sites share one cache entry for a format but declare different `mockSamples`.
- **FMT004** — no JS runtime could be started for the sidecar.

[`patternSidecar.spec.ts`](../../packages/devtools/src/vite-plugin/patternSidecar.spec.ts) covers
the positive half (JS-only regexes compile and validate; generated samples are valid;
`patternSampleCount` is honoured; declared samples win). The negative half is untested, so a
regression that silently stopped failing closed — shipping unverified patterns, exactly what the
retired `allowUncheckedPatterns` used to do on purpose — would not be caught.

`patternSampleRetries` is also untested: it is only observable through budget exhaustion, which is
an FMT005 build failure, so it needs this same harness.

## Fix plan

1. Add a small helper that runs a **programmatic vite build** over a fixture directory outside the
   normal spec globs (so its intentionally-broken types are never picked up by a project's
   `include`), returning `{ok, diagnostics, stderr}` instead of throwing.
2. Give each negative case its own minimal fixture — one bad type per directory, since the first
   error-severity diagnostic halts the build and would mask siblings.
3. Assert on the **diagnostic code** (`FMT003`/`FMT005`/`FMT006`), not on message text: upstream
   headlines carry interpolated values and will drift.
4. Mark the suite slow / opt-in if a full build per fixture proves too expensive for the default
   `pnpm run test` lane — the alternative is driving the resolver binary directly, which is faster
   but tests less of the real path.

## Why it is worth doing

Every one of these diagnostics exists to make a build fail closed rather than ship a type whose
validator or mock generator is wrong. A guard that only proves the success path cannot tell you the
failure path still works — and that failure path is the entire safety argument for having removed
`allowUncheckedPatterns`.

## Done when

- A fixture-build helper exists and is reusable for any future build-time diagnostic.
- FMT003, FMT005 and FMT006 each have a failing-build test asserting on the code.
- `patternSampleRetries` has a test that exhausts the budget and expects FMT005.
