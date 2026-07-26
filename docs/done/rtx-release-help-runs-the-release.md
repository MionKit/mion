---
type: fix
spec: full-plan
status: done
created: 2026-07-26
completed: 2026-07-26
---

# `pnpm rtx release --help` RUNS the release instead of printing help

**Status:** done (see [Implemented](#implemented))
**Created:** 2026-07-26 (hit by accident in an agent session while working on PR #290)

Every other `rtx` area rejects an unknown subcommand. `release` — the one area that publishes —
silently treats it as "no subcommand" and starts the release umbrella.

## Evidence

[scripts/rt.mjs](../../scripts/rt.mjs) `runRelease(args)`:

```js
const [sub, ...rest] = args;
const map = {preflight: …, npm: …, e2e: …, /* … */};
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

## Implemented

Shipped as planned, plus one hole the spec missed.

- **`runRelease` now answers help and refuses the unrecognized.** `help` / `-h` / `--help` print
  the release usage and return; an unknown non-flag sub exits 2 with a usage pointer.
- **The hole the spec missed: unknown FLAGS fell through too.** Guarding only the subcommand still
  let `rtx release --oops` reach the umbrella, because `sub` starting with `-` was treated as "no
  subcommand". There is now an explicit `UMBRELLA_FLAGS` allowlist
  (`--preflight-only`, `--no-website`, `--dry-run`); anything else exits 2.
- **One source for the help text.** The release rows moved into a `RELEASE_HELP` const that the
  full `HELP` interpolates, so `rtx --help` and `rtx release --help` cannot drift. A test asserts
  the former contains the latter.
- **Area-level help, uniformly.** `dispatch()` intercepts a help flag in the FIRST argument
  position for every area (`rtx website --help` used to exit 2 with a usage line). Deeper help
  (`rtx release e2e --help`) still reaches the leaf, which owns its own usage text.
- **Bare `rtx release` no longer releases** (owner decision during review, going beyond the spec's
  "must still run the umbrella"): it prints the help. The chain answers to its own name,
  `rtx release all`, keeping its `--preflight-only` / `--no-website` / `--dry-run` flags. The old
  bare-with-flags form exits 2 with a pointer at the new spelling rather than silently doing
  nothing. Nothing in CI calls the bare form — workflows always pass a subcommand
  (`binaries`, `pack`, `e2e`, `tarballs`, `stage-approve`) — so the inversion costs CI nothing; the
  only reference was one example in CLAUDE.md, updated to `pnpm rtx release all`.
- The sibling-area audit (step 3) found `release` was the only area whose fallthrough was
  dangerous: `runCore` and `runWebsite` already `die()` with a usage line, and `runBench` dies on a
  stray non-flag argument.

**Tests:** seven cases in
[packages/ts-runtypes-devtools/test/repo-contracts.test.ts](../../packages/ts-runtypes-devtools/test/repo-contracts.test.ts)
— help and the bare word both print usage without starting the chain (asserting the absence of its
`Fresh start` / `preflight.mjs` output), the typo exit, the unknown-flag exit on `release all`, the
migration pointer for the old bare-with-flags form, the surviving `release all --dry-run` plan, and
the help-text sync.

**Correction to the Evidence above:** the publish entry's map key is `npm`, not `publish`
(`rtx release npm` → `scripts/release/publish.mjs`). Fixed inline.

**Not done (deliberately):** no confirmation prompt or `--yes` gate on `rtx release all` itself —
requiring the explicit verb was judged enough. A separate idea worth its own spec came out of the review:
have `e2e.mjs` write a receipt (version + per-tarball checksums) that the publishing verbs require,
so "e2e passed" becomes a checkable precondition rather than an honor system.
