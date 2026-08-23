---
type: fix
spec: full-plan
status: ready
created: 2026-08-23
---

# One type-dependency mechanism for every plugin host

## Problem

A rewritten file's correctness depends on types declared in **other** files. Those edges are
invisible to every bundler we integrate with:

- `import type {Signup} from './models.ts'` is erased at compile time.
- A plain `import {Signup}` used only in type position is erased too.
- An **ambient** type (declared in a `.d.ts`) never had an import edge at all.

So when the type changes, nothing tells the bundler to re-run the file that reflects it. The
injected fn id is content-addressed on the type's structure, so a changed shape is a **different**
module — and the host keeps serving a rewrite that imports the previous one.

The wire carries nothing to fix this with. `TransformResult` is
`code` / `map` / `importBlock` / `edits` / `sourceHash` / `emittedModules`
([`src/protocol.ts`](../../packages/ts-runtypes-devtools/src/protocol.ts):282,
[`internal/protocol`](../../ts-go-runtypes/internal/protocol/):498), and `siteFiles` on the generate
response is the set of files that CONTAIN sites, not the set a given rewrite DEPENDS on.

Each host copes differently, and one of them not at all:

| Host | Today |
| --- | --- |
| **Vite dev** | Nothing. `handleHotUpdate` ([`src/unplugin.ts`](../../packages/ts-runtypes-devtools/src/unplugin.ts):910) does `setSources` → `scanFiles` → `generate` and returns nothing, so Vite is never told to re-transform. |
| **Next / Turbopack** | A coarse digest of the generated-module listing ([`src/next/broker.ts`](../../packages/ts-runtypes-devtools/src/next/broker.ts):194-233), declared by every rewritten file ([`loader.ts`](../../packages/ts-runtypes-devtools/src/next/loader.ts):87). Correct, but any type change re-runs every marker-bearing file. |
| **webpack / rspack / rollup / rolldown / bun / esbuild** | Nothing declared at all. |

The Vite failure mode is the worst of the three because it is **silent**: the stale validator does
not error, it accepts data the current type rejects. A developer iterating on a type sees validation
"pass" against a shape that no longer exists.

### Measured

Scratch Vue app, `vite dev`, `Signup` declared in `src/models.ts` and reflected from two places:

```
plain .ts before edit                       __rt_nPZ_BfJXPb5
edit models.ts (add a property) → re-fetch  __rt_nPZ_BfJXPb5   ← unchanged, stale
SFC after touching the SFC itself           __rt_nPZ_tb1XjRd   ← new type, correctly re-injected
```

`.ts` and `.vue` behave identically: the trigger is the erased edge, not the file kind. Both recover
as soon as the using file is touched. A production `vite build` is unaffected (every module is
transformed in one pass), and so is vitest (fresh transform per run).

Reported downstream by mion, whose Vue SFC integration hits it through a virtual path — see
**Virtual sources** below.

## Fix direction

One mechanism, computed once in Go, consumed by every host.

### 1. Go records what the type walk actually read

`ast.GetSourceFileOfNode(declaration).FileName()` is the established pattern
([`internal/convert/set.go`](../../ts-go-runtypes/internal/convert/set.go):246,
[`internal/enrichment/bridge.go`](../../ts-go-runtypes/internal/enrichment/bridge.go):219,
[`resolver/missingtypeargs.go`](../../ts-go-runtypes/internal/compiler/resolver/missingtypeargs.go):174).

Attach the declaration files to the **cache entry**, not to the walker:

- `reflection.RunType` gains `DeclFiles []string` — the files that contributed *this node*: its own
  declaration, each member's declaration, heritage clauses, format/brand declarations. Populate in
  [`internal/cachegen/runtype/`](../../ts-go-runtypes/internal/cachegen/runtype/) (`entries.go`,
  `heritage.go`, `modifiers.go`, `typeid/formats.go`) — each already holds the `symbol.Declarations`
  it needs.
- A site's deps = union of `DeclFiles` over the node closure reachable from its demanded ids. The
  ref-slot walk already exists: `collectRefDeps`
  ([`entries.go`](../../ts-go-runtypes/internal/cachegen/runtype/entries.go):244).

> ⚠️ **Do not instrument `typeid.Computer` instead.** Its `cache map[*checker.Type]string`
> ([`typeid/typeid.go`](../../ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go):103) means
> a warm cache skips the walk entirely, so a collector hung off the walker under-reports on exactly
> the HMR path this fixes — and under-reporting here IS the bug. Deps are a property of the type, so
> they belong on the cache entry.
>
> If [`cachegen/diskcache`](../../ts-go-runtypes/internal/cachegen/diskcache/) persists entries,
> store the paths repo-relative so a restored cache stays valid across machines.

### 2. One wire field, one attachment point

`protocol.TransformResult` gains `TypeDeps []string` (sorted, unique, absolute program paths) in
[`internal/protocol`](../../ts-go-runtypes/internal/protocol/) and its JS mirror
[`src/protocol.ts`](../../packages/ts-runtypes-devtools/src/protocol.ts):282. Set at both
construction sites inside the per-file loop of `OpTransform`:
[`dispatch.go`](../../ts-go-runtypes/internal/compiler/resolver/dispatch.go):1063 (edits mode) and
:1090 (go mode).

Transform is the right carrier because **every host already funnels through it** — including Next,
whose broker calls the unplugin transform hook directly
([`broker.ts`](../../packages/ts-runtypes-devtools/src/next/broker.ts):335).

> ⚠️ **Hard correctness rule.** Empty `typeDeps` on a file that HAS sites means *unknown*, never
> *no deps*. Every host falls back to its coarse behaviour there (Next: the stamp; Vite: invalidate
> every marker-bearing site file). Over-invalidating costs milliseconds; under-invalidating ships a
> validator for a type that no longer exists.

### 3. One shared JS leaf, then thin per-host wiring

New `packages/ts-runtypes-devtools/src/type-deps.ts`:

- `recordTypeDeps(siteFile, deps)` — forward map + reverse index `typeFile → Set<siteFile>`
- `affectedSiteFiles(changed: string[]): string[]`

Populate at the single point where both transform paths obtain `fileResult` — `transformViaGo`
([`unplugin.ts`](../../packages/ts-runtypes-devtools/src/unplugin.ts):475) and `transformViaEdits`
(:506). The Next broker inherits it by calling the same hook.

Per host:

- **Universal, one line in `transform`:** `this.addWatchFile?.(dep)` for each dep. unplugin maps it
  to rollup/vite `addWatchFile` and to the webpack/rspack loader's `addDependency`. This alone gives
  webpack, rspack, rollup, rolldown, esbuild, bun and `vite build --watch` an edge they have never
  had. **Verify the mapping in unplugin 3.3 before relying on it** — if a host does not implement
  it, that host keeps today's behaviour and this doc gets a line saying so.
- **Vite dev:** `addWatchFile` does not invalidate a src module for HMR, so `handleHotUpdate`
  (:910) additionally asks the index for affected site files, resolves them through
  `server.moduleGraph.getModulesByFile`, and returns those `ModuleNode`s.
- **Next:** [`wire.ts`](../../packages/ts-runtypes-devtools/src/next/wire.ts) `BrokerReply` gains
  `typeDeps?: string[]`; [`loader.ts`](../../packages/ts-runtypes-devtools/src/next/loader.ts):87
  declares each via `addDependency`. **Keep the stamp** as the fallback — invariant 7 in
  [`src/next/CLAUDE.md`](../../packages/ts-runtypes-devtools/src/next/CLAUDE.md) records an A/B
  proving it load-bearing in `next dev`, and the fallback rule above needs it.

### Virtual sources — the part a host cannot work around

Not every site file is a real module in the bundler's graph. Sources registered through
`setSources` may be virtual: mion registers a Vue SFC's `<script>` as `Comp.vue.ts`, while the module
Vite actually serves is `Comp.vue`. Invalidating by site-file path silently misses those — `.ts`
files would recover while `.vue` files stayed stale. So the plugin must **report**, not only act:

```ts
onSiteFilesChanged?: (siteFiles: string[]) => void   // fired after generate() on an HMR update
```

The plugin invalidates what it can resolve itself and reports the full set; the host maps its own
virtual paths back to real module ids. Register the key in
[`src/plugin-option-keys.ts`](../../packages/ts-runtypes-devtools/src/plugin-option-keys.ts) and in
the `JS_ONLY` set of
[`test/plugin-option-parity.test.ts`](../../packages/ts-runtypes-devtools/test/plugin-option-parity.test.ts).
Precedent: `onPureFnReport`, a callback that cannot be a tsconfig option.

## Tests

**Go** — new `internal/compiler/resolver/typedeps_test.go`:

- a type declared in another file is reported; an unrelated file is not
- an **ambient `.d.ts`** type is reported (no import edge exists — the case invariant 7 was proven on)
- **a warm second transform still reports** (the memoization trap in step 1)

Marker coverage rule ([CLAUDE.md](../../CLAUDE.md)) applies: paired tests for `getRunTypeId<T>()` and
`getRunTypeId(value)`, with one hash-equivalence assertion. Pattern:
`TestAtomic_FormEquivalence` in
[`resolver/atomic_test.go`](../../ts-go-runtypes/internal/compiler/resolver/atomic_test.go).

**JS**

- extend [`test/hot-update-overlay.test.ts`](../../packages/ts-runtypes-devtools/test/hot-update-overlay.test.ts)
  (already spawns the real binary over a temp project): after editing a type source, the dependent
  file's `typeDeps` names it, an unrelated file's does not, and the injected id actually moves
- new `test/type-deps-invalidation.test.ts`: reverse index, plus `onSiteFilesChanged` firing with
  the right set including a virtual site file
- [`test/next-broker.test.ts`](../../packages/ts-runtypes-devtools/test/next-broker.test.ts): reply
  carries `typeDeps`; stamp still present
- update `test/plugin-option-parity.test.ts` for the new key

**e2e** — [`container/pre-publish-e2e/apps/smoke-next/`](../../container/pre-publish-e2e/apps/smoke-next/):
a second build after a type edit asserts the injected id changed. There is deliberately **no**
`next build` test in vitest; `src/next/CLAUDE.md` explains why, and forbids adding one.

## Docs

- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) — dependency reporting in the execution model.
- [`src/next/CLAUDE.md`](../../packages/ts-runtypes-devtools/src/next/CLAUDE.md) — invariant 7 becomes
  "precise deps, stamp as fallback", keeping the A/B evidence.
- Website: one short line that editing a type in another file now refreshes correctly in dev. The
  callback stays out — an integrator-only knob, per the website docs rule.

## Rollout

Five phases. This spec drives both repos; mion's
`docs/todos/type-only-dep-hmr-staleness.md` is its mion-side half.

**Phase 1 — upstream.** Implement the three layers here. Green before moving on:
`go -C ts-go-runtypes test ./internal/...`, `pnpm test`, `pnpm run lint`, `pnpm run format`, and the
`smoke-next` e2e build (the Next lane's only real coverage). **No phase 2 on a red phase 1.**

**Phase 2 — pack and temp-install into mion.** Existing tooling, no new scripts:

```bash
pnpm rtx release binaries          # assembles dist-binaries/ (platform packages)
pnpm run build                     # the publish-shaped JS build
pnpm rtx release pack              # → tarballs/*.tgz, the exact publish artifacts
```

Then repoint mion's consumed packages at `file:../ts-run-types/tarballs/<name>.tgz`.

Gotchas, verified rather than assumed:

- **The platform tarball is required too.** `@ts-runtypes/bin`'s `getExePath()` resolves the
  resolver binary from a `@ts-runtypes/binary-<os>-<arch>` optional dep. Temp-install that tarball
  alongside `core` / `devtools` / `bin`, or every mion build fails at spawn.
- **mion's policies do not block this.** `blockExoticSubdeps: true` is scoped to *transitive* deps
  ("direct dependencies may declare any source"), and `minimumReleaseAgeExclude` already lists
  `'@ts-runtypes/*'`. `ignoreScripts: true` is harmless — we ship no postinstall downloader.
- **There is precedent.** mion vendored `@ts-runtypes/*` tarballs under `vendor/ts-runtypes/` with
  `file:` refs during the migration (`docs/done/progress-log.md:182`, since removed). Reuse that
  shape rather than inventing one.

**Phase 3 — mion side.** With the real upstream build installed, do the work in mion's
`type-only-dep-hmr-staleness.md`: wire `onSiteFilesChanged`, add the `Map<virtualPath, realFile>` in
`sfcTransform.ts` so `Comp.vue.ts` → `Comp.vue`, and re-verify that mion's fabricated
`handleHotUpdate` context (`{file, read, modules: [], timestamp: 0}`) still satisfies the upstream
hook. Cover it in `sfcTransform.spec.ts`.

**Phase 4 — prove it end to end, then open both PRs.** Run the acceptance scenario below against the
temp-installed build, `.ts` **and** `.vue`. Neither PR opens before the other side is green — the
whole point is that they were tested together.

**Phase 5 — revert the temp wiring.** Restore mion's `@ts-runtypes/*` deps to registry versions and
the lockfile with them. A `file:` tarball ref must never reach either PR: mion's exact-pin policy
and `frozenLockfile: true` make a stray one a broken install for everyone. The mion PR notes that it
needs the next `@ts-runtypes/*` release and lands after that bump.

## Out of scope

- Making the HMR Program rebuild incremental. `setSources` rebuilds the whole Program on every edit
  and is the real HMR cost — tracked in [docs/ROADMAP.md](../ROADMAP.md), unchanged by this.
- The `allSingle` import-grouping bug — separate, already fixed in `c7fb861`.
- Cutting the release itself. That is the [release-to-prod skill](../../.claude/skills/release-to-prod/)'s
  job, after the upstream PR merges.

## Done when

The measured scenario passes in `vite dev` against the temp-installed build: with `Signup` in
`src/models.ts` reflected from `src/uses.ts` and from a `.vue` `<script>`, adding a required
`country: string` and re-fetching **without touching either file** returns a new `__rt_…` id whose
body checks `country`.

Plus: the `next dev` ambient-`.d.ts` A/B still passes, a webpack/rspack watch build picks up the
same edit, both PRs are open and green, and mion carries no `file:` refs.

> Verify the Next lane in **dev**, against a type with no import edge. `next build` re-runs loaders
> on every build, so it picks up a type change even with the stamp disabled — confirmed against the
> persistent build cache (`turbopackFileSystemCacheForBuild`, 16.3), for an ordinary imported type
> and an ambient one alike, with the cache demonstrably in use (16.6s cold, 5.6s warm, 3.7s
> no-change rebuild). **A build-lane test passes either way and proves nothing.**

## Supersedes

- `docs/todos/next-precise-type-dependencies.md` (this repo) — the Turbopack angle, with its
  verified cache findings carried into **Done when** above.
- `docs/todos/upstream-hmr-invalidate-site-files.md` (mion) — the Vite angle, filed there as an
  upstream ask; its virtual-source requirement is a hard constraint above.
