---
type: chore
spec: guidelines
status: ready
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

- The trial saves at least a third of the js-lint suite's wall time on both changes, with the numbers recorded here.
- A new or changed reflected type reruns only the tests whose own roots reach it, with a test in `scripts/` that pins it (the `boundAliases.test.ts` probe above changes 1 key, not 84).
- CI runs the skip on pull requests and the safety net on main, both with tests.
- The simplify-comments pass ran on every touched source file, committed on its own.
