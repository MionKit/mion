# Bumped to `@ts-runtypes` 0.12.2 — guards dropped, `allSingle` proven in a live server

**Status:** done — shipped on `claude/ts-runtypes-upstream-todos-s1dbu4`.
**Created:** 2026-08-22 · **Completed:** 2026-08-23

Everything mion had waiting on one upstream release landed together. The release
([ts-run-types#363](https://github.com/MionKit/ts-run-types/pull/363), published as 0.12.2) carried
both commits this needed: the type-dependency invalidation, and the follow-up that stops a virtual
source being declared as a bundler watch dependency. Both were verified present in the published
tarball before the pins moved, not assumed from the version number.

## What shipped

### 1. The pins

All 9 `@ts-runtypes/*` pins across 7 packages raised 0.12.1 → 0.12.2 (`core`, `devtools`, `bin`).
`minimumReleaseAgeExclude` already listed `@ts-runtypes/*`, so the 30-day policy did not block it.

The lockfile diff was checked package-by-package rather than eyeballed: **the only resolved versions
that changed are `@ts-runtypes/*`** (including the seven per-platform `binary-*` packages). One
unrelated-looking detail, confirmed harmless: vitest's peer key gained `jsdom@20.0.3` — vitest stays
4.1.4 and jsdom's version is unchanged, it is a peer-set recomputation.

### 2. The forward-compat shim is gone

`RtPluginOptions` (the `TsRuntypesPluginOptions & {onSiteFilesChanged?}` intersection) existed only
so mion typechecked against 0.12.1, whose `PluginOptions` did not declare the key. 0.12.2 declares
it, so the options object is plainly `TsRuntypesPluginOptions` again.

### 3. The `allSingle` guard is gone — and the mode is now PROVEN, not just unblocked

The config-time guard in `mionVitePlugin.ts` and its two `removedOptions.spec.ts` cases are removed;
the spec now asserts all three module modes are accepted. The option's JSDoc records that the mode
was rejected until 0.12.2 and why, rather than silently dropping the history.

**The end-to-end check that guard had been blocking has now run** (see
[server-mappers-from-generated-pure-fn-cache.md](server-mappers-from-generated-pure-fn-cache.md),
which recorded the transport's `allSingle` handling as "correct-by-construction and unit-tested, not
proven in a running server"). `packages/test-server` was built under `moduleMode: 'allSingle'` and:

- **The build succeeds.** Rollup traced every binding, which is exactly what used to fail: the entry
  emits **nine separate imports, one per family bundle** (`fns/val.js`, `verr`, `pj`, `rj`, `sj`,
  `huk`, `uke`, `tb`, `fb`). Under the old bug there was one import from `val.js` naming all of them,
  and rollup died with an empty error thousands of columns into a single-line import.
- **The built server evaluates and registers its routes** — no `MissingRtFnsError` on
  `mion@methodsMetadata`, the failure the guard was protecting against.
- **The server-mapper transport resolves.** The generated mapper imports the pure fn from the
  CLIENT's genDir (`../client/__runtypes/types/pf/rt/<key>.js`), which is correct and independent of
  the server's own `moduleMode`: the transport reuses whatever the harvesting build emitted. A server
  on `allSingle` consuming a `default`-harvested manifest is a supported combination, not a mismatch.

### 4. The gated SFC test opened by itself

`sfcTransform.spec.ts`'s "type-dependency invalidation" case was gated on `upstreamReportsStaleSites`,
a probe of the installed build. With 0.12.2 installed the suite went from **12 passed + 1 skipped to
13 passed** with no edit to the test — the self-healing gate working as designed, against the real
published release rather than a locally packed one.

## Still open

Nothing blocking. One optional upstream idea survives — a first-class "transform this virtual
source" API that would let part of `sfcTransform.ts` be deleted instead of fabricating an HMR
context. Nothing in mion needs it. It now has its own spec so it stops getting lost inside other
documents: [../todos/upstream-virtual-source-transform-api.md](../todos/upstream-virtual-source-transform-api.md).
