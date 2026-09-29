---
type: chore
spec: guidelines
status: ready
created: 2026-09-29
---

# Make the per-file test skip pay off, then run it in CI

## Intent

`pnpm miondevx core test-skip` skips a vitest file whose compiled code already passed. On the js-lint suite it saves only 22 to 24% of wall time (396s plain, 301s and 310s after a replayed Go-only and JS-only change), because the files it never caches dominate the run: 195 of 485 files, 100 of them in devtools-core, which drive `mion-bin/mion` directly or read fixture files. Wire it into CI only once it saves at least a third.

## Direction

The implementer plans the details. Verified pointers:

- The never-cache rule is `UNCACHEABLE` in `scripts/core/test-skip.mjs`: any import of `child_process`, `fs`, `net`, `http` or `worker_threads`. `pnpm miondevx core test-skip --keys <file>` writes every key and reason, so start by counting which helpers make files uncacheable (`packages/devtools/test/helpers/inline.ts` is the big one).
- A file that only spawns the resolver could be keyed on the binary's own identity (`resolverDigest()` / `extractDigest()` in `scripts/core/build.mjs`) instead of refused. A file that reads fixtures needs those files declared as inputs. Anything that cannot be declared keeps running.
- Once it clears the bar, wire it the way the first plan described: the passed list cached with `actions/cache` (`restore-keys: mion-vitest-passed-`, saved per run), PRs only, layered under `core test-pr --skip-passed` in js-lint's suite step, and a main-branch safety net that runs everything and fails when a file the list would have skipped fails (that file's key misses an input). Add the `mion-vitest-passed-` family to `KEEP_ON_MAIN` in `scripts/ci/cache-cleanup.mjs` then, not before.
- Re-run the trial on a Go-only and a JS-only change and record the numbers here.

## Docs

None, because this is contributor-only CI; update the `test-skip` line in the root CLAUDE.md Testing section once CI uses it.

## Done when

- The trial saves at least a third of the js-lint suite's wall time on both changes, with the numbers recorded here.
- CI runs the skip on pull requests and the safety net on main, both with tests.
- The simplify-comments pass ran on every touched source file, committed on its own.
