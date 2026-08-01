---
type: chore
spec: guidelines
status: done
created: 2026-07-29
completed: 2026-08-01
---

# Fuzz cloning lane wiring drift: README, env registry, rtx suite, ci.yml labels

Out-of-scope findings from a fuzz-lane wiring audit: the `cloning` fuzz lane
shipped without the wiring every other lane carries, and the ci.yml partition
labels have rotted.

## Findings (verified 2026-07-29)

1. **`test/fuzz/cloning/` is missing from
   [test/fuzz/README.md](../../packages/ts-runtypes/test/fuzz/README.md).**
   The lane exists (5 files: `cloneFuzz.integration.test.ts`,
   `cloneFuzzRunner.ts`, `cloneOracle.ts`, `extrasValue.ts`,
   `referenceClone.ts`) but the README's layout tree, fuzz-modes sections, and
   env-var table never mention it, while every other lane has all three.
2. **`RT_FUZZ_CLONE_SOAK_MS` is missing from the env `REGISTRY`**
   ([scripts/lib/env.mjs](../../scripts/lib/env.mjs)). The lane reads it
   (`cloneFuzz.integration.test.ts:541`), and CLAUDE.md's rule is that EVERY
   env var a test reads must be registered (`pnpm run check:env` is the
   contract). Add the `dev`-scoped row + the `.env.sample` line.
3. **No `cloning` suite in the rtx FUZZ map**
   ([scripts/rt.mjs](../../scripts/rt.mjs)) — `pnpm rtx core fuzz cloning`
   does not exist, unlike value/types/enrich/i18n/typemod/race.
   Add the entry (`patterns: ['cloneFuzz.integration']`, soak knob
   `RT_FUZZ_CLONE_SOAK_MS`) + the usage-string mention.
4. **Stale ci.yml partition labels**
   ([.github/workflows/ci.yml](../../.github/workflows/ci.yml)): the comment
   says "23 + 151 = 174 files" and the step names repeat "23 files" /
   "151 files", but `test/fuzz/**` now holds 25 `*.test.ts` files (182 total
   package test files). The globs are correct (the partition is pattern-based,
   only the prose is wrong); either refresh the numbers or drop them from the
   labels so they cannot rot again (prefer dropping — a count in a comment is
   a drift magnet).

## What shipped

1. **README** — `cloning/` added to the layout tree, a `### cloning/` section
   between `binary/` and `enrich/` matching the sibling lanes' depth (the
   differential premise, the three input streams, one bullet per file), a
   `RT_FUZZ_CLONE_SOAK_MS` env-table row, and an **O15/O16/O17** row in the
   oracle catalog. The Running section lists `cloning` in the suite set.
2. **Env registry** — `RT_FUZZ_CLONE_SOAK_MS` added as a `dev` row next to the
   other `*_SOAK_MS` knobs, plus the `.env.sample` line.
3. **rtx** — `cloning: {patterns: ['cloneFuzz.integration'], soak: {RT_FUZZ_CLONE_SOAK_MS: '60000'}}`
   in the FUZZ map, placed after `types`.
4. **ci.yml** — the three stale counts dropped rather than refreshed (the
   todo's stated preference, and the right call: the numbers had drifted
   further still, to 25 fuzz / 243 total, since the todo was written).

Out-of-scope fix taken in the same line: the `rtx --help` fuzz-suite list also
omitted `sidecar` and `patterngen`. Since that is the same drift defect on the
line being edited, the usage string now lists every FUZZ key.

## Verified

- `pnpm run check:env` prints the `RT_FUZZ_CLONE_SOAK_MS` row.
- `rtx --help` and the unknown-suite error both list `cloning`.
- `pnpm rtx core fuzz cloning` → 1 file, 3 passed, 1 skipped (the soak
  self-skips without its env var).
- `pnpm rtx core fuzz cloning --soak` → 4 passed, no skip, 63s duration: the
  soak knob is set and the soak actually runs.
- `pnpm run check-format` and `pnpm run lint` green.

## Done when

- [x] README documents the cloning lane (layout tree + a `### cloning/` section +
      env table row), matching the depth of the sibling lane sections.
- [x] `RT_FUZZ_CLONE_SOAK_MS` is in the env REGISTRY and `.env.sample`;
      `pnpm run check:env` shows it.
- [x] `pnpm rtx core fuzz cloning` runs the lane; `--soak` sets the soak knob.
- [x] ci.yml step labels no longer carry wrong counts.
