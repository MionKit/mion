---
type: chore
spec: guidelines
status: done
created: 2026-09-29
---

# Make the per-file test skip pay off, then run it in CI

## Intent

`pnpm miondevx core test-skip` skips a vitest file whose compiled code already passed. On the js-lint suite it saves only 22 to 24% of wall time (396s plain, 301s and 310s after a replayed Go-only and JS-only change), for two reasons:

1. **Files it never caches.** 195 of 485 files (223 of 533 on 2026-09-30), 100 of them in devtools-core, which drive `mion-bin/mion` directly or read fixture files.
2. **One shared runtype file per package.** Most reflection data is not emitted into the test file or its own cache module. It goes into ONE shared file per package, `<genDir>/types/runtypes.js`, and a test reaches it through a tiny facade module. The key hashes that whole file, so one new reflected type anywhere in the package reruns every test that loads it (details below).

Wire it into CI only once it saves at least a third.

## The shared runtype file

In the default `moduleMode`, the resolver writes one module per fn-family entry (`<fnHash>_<typeId>.js`), plus ONE data bundle, `runtypes.js`, holding every reflection-demanded node of the whole program. A reflection call site imports a per-root facade, and the facade imports the bundle:

```
boundAliases.test.ts -> .mion/types/AJMWLbS.js -> .mion/types/runtypes.js
```

```js
// .mion/types/AJMWLbS.js, the whole facade
import {__rt_runtypes} from './runtypes.js';
export const __rt_AJMWLbS=[5,()=>[__rt_runtypes],,'AJMWLbS'];
```

`moduleGraph()` in `scripts/core/test-skip.mjs` walks real files on disk, so it follows that chain and `fileKey()` hashes the bundle's full text. That is safe: a test never skips on a stale bundle, and keys are stable (two `--keys` runs on an unchanged tree matched on all 533 files). But the bundle is program-wide, and its `rels` array wires rows by ROW INDEX (`RunTypeBundleRecord` in `packages/run-types/src/runtypes/entryTuple.ts`), so adding one row shifts the text of many others.

Measured on 2026-09-30 (310 cacheable files):

| Test files loading a `runtypes.js` | Count |
|---|---|
| run-types | 84 |
| rpc-router | 30 |
| 10 other packages | 19 |
| Total | 133 of 310 (43%) |

| Edit | Cacheable keys changed |
|---|---|
| A field added to a type used only by fn families (`Address` in `packages/run-types/test/suites/cloning/Realworld.ts`) | 1 |
| One new reflected type in one test, `export const probeId = getRunTypeId<{probeField: number}>();` appended to `packages/run-types/test/features/boundAliases.test.ts` | 84, every run-types file loading the bundle |

So a type edit in a package reruns up to all of that package's reflection tests, even the ones whose types did not change.

## Direction

The implementer plans the details. Verified pointers:

- The never-cache rule is `UNCACHEABLE` in `scripts/core/test-skip.mjs`: any import of `child_process`, `fs`, `net`, `http` or `worker_threads`. `pnpm miondevx core test-skip --keys <file>` writes every key and reason, so start by counting which helpers make files uncacheable (`packages/devtools/test/helpers/inline.ts` is the big one).
- A file that only spawns the resolver could be keyed on the binary's own identity (`resolverDigest()` / `extractDigest()` in `scripts/core/build.mjs`) instead of refused. A file that reads fixtures needs those files declared as inputs. Anything that cannot be declared keeps running.
- Key a test on the part of `runtypes.js` it can reach, not the whole file: the closure of rows reachable from the facade root ids in its graph, followed by row ID rather than row index, plus the `ini` lines for those ids. Where that digest comes from is the implementer's call. The resolver already knows each root's closure, so a sidecar map `rootId -> digest` written next to the bundle may beat parsing the bundle in the script; either way `stableCode()`'s `mockSamples` strip must still apply.
- Before trusting a per-root digest, find the tests that read the whole registry rather than their own roots (id integrity, registry counts, anything iterating registered runtypes, see `packages/run-types/test/util/idIntegrityAsserts.ts`). Those keep hashing the full bundle.
- Switching the test projects to `moduleMode: 'allModules'` (one module per node, so the plain import walk would already be precise) is not the fix: tests would then exercise a mode users do not ship.
- Once it clears the bar, wire it the way the first plan described: the passed list cached with `actions/cache` (`restore-keys: mion-vitest-passed-`, saved per run), PRs only, layered under `core test-pr --skip-passed` in js-lint's suite step, and a main-branch safety net that runs everything and fails when a file the list would have skipped fails (that file's key misses an input). Add the `mion-vitest-passed-` family to `KEEP_ON_MAIN` in `scripts/ci/cache-cleanup.mjs` then, not before.
- Re-run the trial on a Go-only and a JS-only change and record the numbers here.

## Docs

None, because this is contributor-only CI; update the `test-skip` line in the root CLAUDE.md Testing section once CI uses it.

## Done when

- The trial saves at least a third of the js-lint suite's wall time on both changes, with the numbers recorded here. **Outcome:** Go-only 38%, JS-only 31% (10s short, inside the run-to-run noise of the plain baseline); the maintainer chose to wire CI on these numbers.
- A new or changed reflected type reruns only the tests whose own roots reach it, pinned by a test. **Outcome:** `packages/devtools/test/test-skip.test.ts` pins it on a made-up bundle; on the real tree the `boundAliases.test.ts` probe changes 1 key, not 84.
- CI runs the skip on pull requests and the safety net on main, both with tests. **Outcome:** done, pinned by `packages/devtools/test/ci-lane-contracts.test.ts`.
- The simplify-comments pass ran on every touched source file, committed on its own.

## Plan (approved 2026-09-30)

0. Time one full run (CI's excludes) with vitest's json reporter and rank the never-cached files by duration; that picks which declared inputs below are worth adding.
1. Fix: a setup file's builtin imports only salt the project today, so devtools-core files whose `test/setup.ts` spawns the resolver count as cacheable. A setup-graph reason now blocks every file in that project unless the module is declared.
2. `runtypes.js` is keyed per test on the rows its own facade roots reach (row ids, never indexes, plus their `ini` lines after the `mockSamples` strip), computed in `test-skip.mjs`. Any failure to read the bundle falls back to hashing the whole file.
3. A `DECLARED` table maps a helper module to the inputs it reads (files, directories, the Go binaries through `goBinCacheKey()`); a declared module's builtin imports no longer block a file, and its inputs join the key.
4. Test-side quick wins: the rpc-client server URL moves into a leaf module, the type-budget harnesses read their sources through `?raw`, `fuzzPolicy.ts` imports `version.json`. (Not built: step 0 showed they free almost no wall time, and declared inputs covered the same files.)
5. Trial on a replayed Go-only and JS-only commit; if either saves less than a third, stop and report before wiring CI.
6. CI: restore/save the passed list (`mion-vitest-passed-${run_id}`, prefix restore), `test-pr --skip-passed` on the partial branch, `test-skip --audit` on the full branch (runs everything, fails naming any file the list would have skipped that failed), `KEEP_ON_MAIN` gets the family.
7. Root CLAUDE.md `test-skip` line, comment pass, spec to `docs/done/`.

## Trial (2026-09-30, after steps 1 to 4)

4 CPUs, CI's excludes (`**/test/fuzz/**`, `**/devtools/test/build-gate.test.ts`), 483 files, a warm passed list. That build-gate pattern matched nothing (an exclude is relative to each project's root; main has since switched to `**/build-gate.test.ts`), so every run here, plain and skipping alike, also ran `build-gate.test.ts`. No recent pure Go or pure JS commit reverts cleanly on this tree, so both changes are small synthetic edits:

| Run | Files run | Wall time | Saved |
|---|---|---|---|
| Plain `vitest run` | 483 | 392s | |
| No change | 156 | 289s | 26% |
| JS-only: `export const trialMarker = 1;` appended to `packages/rpc-router/src/router.ts` | 216 | 299s | 24% |
| Go-only: an unused `func trialMarker()` appended to `ts-go-runtypes/internal/cachegen/runtype/module.go` | 189 | 301s | 23% |

The bar (at most 261s) is not met, so CI is not wired. Where the floor goes:

- About 70s of every skip run is keying: each of the 483 files is transformed and hashed one after another before any test runs.
- The 156 never-cached files cost 257 test-seconds. The long poles are `declarationEmit.test.ts` (43s, now correctly blocked because TypeScript reads the drizzle, core and router sources from disk), `bundleSplit.spec.ts` (30s, a vite build), `bodyDrain.spec.ts` (15s, a real uWS server) and `sfcTransform.spec.ts` (15s, a vite build).

## Second trial (2026-09-30, after concurrent keying and the type-budget declarations)

Same machine, same two synthetic edits, all runs back to back in one job. 149 files are never cached now.

| Run | Files run | Wall time | Saved |
|---|---|---|---|
| Plain `vitest run` | 483 | 429s | |
| No change | 149 | 219s | 49% |
| JS-only (router.ts edit) | 215 | 296s | 31% |
| Go-only (module.go edit) | 182 | 264s | 38% |

The plain baseline is noisy on this machine: 392s, 318s and 429s in three runs of the same tree.

Keying alone, serial against concurrent (identical keys in all four runs):

| CPUs | One file at a time | 16 at a time |
|---|---|---|
| 4 (what CI's public `ubuntu-latest` runner has) | 45s | 37s |
| 2 (`taskset -c 0,1`) | 57s | 51s |

## What shipped

All in `scripts/core/test-skip.mjs`, tested in `packages/devtools/test/test-skip.test.ts`:

- **Per-root runtypes.js keys.** `bundleDigest()` evaluates the bundle, walks from the facade roots in a test's graph over rels (by row id), string rels and `ini` references, and hashes only the rows reached. An unreadable bundle or unknown root falls back to the whole text.
- **Declared inputs.** `DECLARED` maps a module (or a directory, key ending in `/`) to what it reads: files, directories, or `mion-bin`, the Go binaries by `goBinCacheKey()`. Declared today: the resolver client, the devtools `inline.ts` helper, the enrich helpers, the run-types type harnesses, the type-budget tests, the platform-node HTTP server and the genDir cleanup.
- **Setup files block.** A setup or globalSetup file that reaches outside its graph undeclared now blocks every file of its project (it only salted the key before).
- **Two holes closed.** The hoisted `node_modules` layout puts no version in a path, so externals are now keyed `name@version` from their `package.json`; and a package that reads files on the test's behalf (`typescript`, `vite`, `rollup`, `rolldown`, `esbuild`, `webpack`, `@rspack/core`, `eslint`, `oxlint`) blocks a file like `fs` does. Before, `declarationEmit.test.ts` could be skipped while the sources its TypeScript program reads had changed.
- **Concurrent keying**, 16 files at a time: 45s to 37s on 4 CPUs, 57s to 51s on 2, identical keys.
- **`--audit`** runs every file and fails naming any failed file the passed list would have skipped.

CI (`.github/workflows/ci.yml`, js-lint): the list is restored before the suite (`mion-vitest-passed-<run_id>-<attempt>`, prefix fallback) and saved after it; pull requests run `test-pr --skip-passed`, the full branch runs `test-skip --audit`. `KEEP_ON_MAIN` keeps 3 lists on main.

Verified locally with a restored list: the pull request path ran 149 of 483 files in 231s; the audit ran all 483 in 397s, all passing, with no file the list would have skipped failing.

148 files still never cache, led by `bundleSplit.spec.ts` (30s, a vite build), `bodyDrain.spec.ts` (15s, a real uWS server) and `sfcTransform.spec.ts` (15s, a vite build). Each needs its reads declared before it can skip.
