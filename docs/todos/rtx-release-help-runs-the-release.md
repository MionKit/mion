---
type: fix
spec: full-plan
status: todo
created: 2026-07-26
---

# `pnpm rtx release --help` RUNS the release instead of printing help

**Status:** todo
**Created:** 2026-07-26 (hit by accident in an agent session while working on PR #290)

Every other `rtx` area rejects an unknown subcommand. `release` — the one area that publishes —
silently treats it as "no subcommand" and starts the release umbrella.

## Evidence

[scripts/rt.mjs](../../scripts/rt.mjs) `runRelease(args)`:

```js
const [sub, ...rest] = args;
const map = {preflight: …, publish: …, e2e: …, /* … */};
if (map[sub]) return proxy(map[sub][0], [...map[sub][1], ...rest]);
// Umbrella (no sub): preflight -> npm publish -> website build.
```

There is no `-h` / `--help` case and no unknown-sub `die()`, so **anything** the map does not know
falls into the umbrella: `scripts/release/preflight.mjs` → `scripts/release/publish.mjs` →
website build (minus whatever `--preflight-only` / `--no-website` skip).

- Top-level `help | -h | --help` IS handled, but only in `dispatch()` — it never reaches an area.
- `runCore` ends with `die('usage: rtx core <build|smoke|fuzz …>')`, the behavior `release` is
  missing. `runRelease` is the outlier.

**Observed:** `node scripts/rt.mjs release --help` printed `[1/6] Fresh start (clean + reinstall)`
and ran `pnpm -r run fresh-start && rmrf node_modules && pnpm install --frozen-lockfile`, then the
Go binary build, then the full Go test suite. It stopped only because the invoking pipe closed. Had
preflight finished it would have continued into `publish.mjs`; that run happened to have no
`NPM_TOKEN`, so it would have died at auth — luck, not a guard.

## Why it matters

- `--help` is what you type when you are LEAST sure what a command does, and here it is a
  destructive default on the publish path.
- The same hole swallows typos: `rtx release pacK` runs the umbrella instead of erroring.
- It wipes `node_modules` and reinstalls before doing anything, so an accidental invocation costs
  minutes even when it fails later.

## Fix plan

1. In `runRelease`, before the map lookup, handle `help` / `-h` / `--help` by writing the release
   usage lines (the `rtx release …` rows already in the `HELP` string) and returning.
2. After the map lookup, `die()` on an unknown NON-FLAG sub, mirroring `runCore`'s usage line, so a
   typo can never reach the umbrella. Bare `rtx release` (no args) must still run the umbrella, and
   the umbrella's own flags (`--preflight-only`, `--no-website`) must still pass through.
3. Audit the sibling areas in the same pass: `runWebsite`, `runBench`, `runContainer`, `runEnv`
   should each answer `--help` and reject an unknown sub rather than falling through to a default.

## Tests

`scripts/` has no vitest project, so pin it where the repo already asserts repo-level contracts
(`packages/ts-runtypes-devtools/test/repo-contracts.test.ts`): spawn
`node scripts/rt.mjs release --help`, assert exit 0, assert the output contains the usage rows, and
assert it did NOT start a build (no `Fresh start` / `preflight` line). A second case for an unknown
sub asserting a non-zero exit.

## Done when

- `pnpm rtx release --help` prints usage, exits 0, and runs nothing.
- `pnpm rtx release <typo>` exits non-zero with a usage message.
- Bare `pnpm rtx release` still runs preflight → publish → website build.
- A test covers the `--help` and unknown-sub cases.

## Out of scope

Changing what the umbrella itself does (adding a confirmation prompt, a `--yes` gate). Worth
discussing separately; this spec only stops `--help` and typos from reaching it.
