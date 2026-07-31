---
type: chore
spec: guidelines
status: ready
created: 2026-07-29
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

## Done when

- README documents the cloning lane (layout tree + a `### cloning/` section +
  env table row), matching the depth of the sibling lane sections.
- `RT_FUZZ_CLONE_SOAK_MS` is in the env REGISTRY and `.env.sample`;
  `pnpm run check:env` shows it.
- `pnpm rtx core fuzz cloning` runs the lane; `--soak` sets the soak knob.
- ci.yml step labels no longer carry wrong counts.
