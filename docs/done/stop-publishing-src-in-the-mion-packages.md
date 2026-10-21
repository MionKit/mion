---
type: chore
spec: guidelines
status: done
created: 2026-09-19
---

# Stop publishing `src` in the mion packages, and prove nothing breaks

## Intent

Every published mion package shipped its TypeScript sources: client, core, devtools, router,
run-types, all the platform adapters, all the drizzle packages. The reason was the `source`
export condition, which points at `./index.ts` or `./src/index.ts`. In-repo that condition is
load-bearing: the root `tsconfig.json` sets `customConditions: ["source"]` and the vitest
configs set `resolve.conditions: ['source']`, so the workspace packages type-check and test
against each other's sources with no build.

A published package should ship what any other package ships: type definitions and build
output, no sources. That also means proving nothing in the pipeline, the Go resolver included,
needs a dependency's `src` to be present.

## What the investigation found

**Nobody resolves the `source` condition in a published install unless they ask for it.**
The pre-publish e2e packs the real tarballs and builds consumer apps across vite, esbuild,
rollup, rolldown, webpack, rspack, bun, bun-preload and Next/Turbopack. None picks the
condition up. The one app that gets it opts in by hand with `customConditions: ["source"]`
in its tsconfig.

**Two premises in the original plan were wrong, and both changed the answer.**

1. `src` was not "roughly a whole second copy". Measured against the real published tarballs
   it was 17 to 21 percent: 134 KB of 796 KB for `@mionjs/core`, 504 KB of 2720 KB for
   `@mionjs/run-types`. The dist dominates, because it carries ESM, CJS, declarations and
   maps.
2. `src` was not only there for the export condition. Every package ships `.d.ts.map` files,
   and they point at it:
   `{"sources":["../../../../src/aot/aotCaches.ts"]}` from `package/.dist/esm/src/aot/`
   resolves to `package/src/aot/aotCaches.ts`. Declaration maps carry no embedded source, so
   dropping `src` leaves every "go to definition" in a consumer's editor pointing at nothing.
   The maps had to go with the sources. `.js.map` files embed `sourcesContent` and were
   unaffected, so runtime debugging still works.

Together that is 26 percent of a tarball, not 18.

`mion-pro` was dropped as a product idea, so the comment naming it as a source-first consumer
was removed rather than preserved.

## What shipped

Applies to all 16 packages that carried the condition. `@mionjs/bin-compiler` and
`@mionjs/bin-uws` already shipped `lib/` only.

**The tarball.** Every published `files` array drops `src`, `index.ts` and the two `!src/**`
negations, and gains `!<dist>/**/*.d.ts.map` next to the existing `!<dist>/**/*.tsbuildinfo`.
`declarationMap` stays on in `tsconfig.json`: the build's broken-emit sentinel is orphan
`.d.ts.map` detection, so the maps are excluded from the tarball, not from the build.

**The manifest.** The workspace manifest keeps its `source` condition, because in-repo
resolution runs on it. `scripts/release/pack.mjs` packs each workspace package from its
published manifest instead: `stripSourceCondition` (new, `scripts/lib/publish-manifest.mjs`)
removes every `source` key from `exports` at any depth, and the original is restored in a
`finally`. That one key is the only difference between the two manifests.

**The drizzle version line.** `scripts/lib/drizzle-line.mjs` decided "same version means same
published bytes" by hashing the tarball's `src/**`, which with no sources in the tarball
collapses to `package.json` alone and calls two different publishes equal. The one predicate
split in two: `isTrackedSource` for the git side (unchanged, `src/` still exists in the repo)
and `isPublishedFile` for the tarball side, which now counts every shipped file except
`*.tsbuildinfo`. `tarballSourceDigests` / `tarballSourceDiff` were renamed to
`tarballFileDigests` / `tarballContentDiff` to match.

**Proof that the resolver follows the manifest.** The Go resolver never looks for type
definitions itself: it hands tsgo the parsed `CompilerOptions` wholesale and tsgo does all of
`exports` / `types` / `typesVersions` / `paths`. New
`ts-go-runtypes/internal/compiler/resolver/types_layout_test.go` pins that over four
dependency layouts, all resolved with no custom conditions: definitions in `dist`, definitions
in `src`, a flat `exports` entry, and a `types` field with no `exports` at all. Each runs both
`getRunTypeId` call shapes per the marker coverage rule.

**The fixtures that modelled the old shape.** `testfixtures.RealMarkerPackage` staged the
marker's `src/` and its workspace manifest, which is no longer the package a consumer installs:
it now stages the published manifest with no `source` condition and no sources. The sources
moved to a separate opt-in, `RealMarkerSources`, which the one test that genuinely models the
workspace layers back on (`TestBuiltinDelivery_SourcesServeWithoutArtifact`: an unbuilt
run-types still serves its built-ins to a sibling, because the workspace has the sources).
`realdrizzle.go`'s header said the drizzle packages publish `src/`; it now says it models the
workspace.

**The e2e.** `apps/smoke-source` resolved the published `@mionjs/run-types` to its `src`, which
is no longer possible. It is re-pointed at a new fixture, `apps/libs/src-types`
(`@acme/src-types`), a dependency whose type definitions live under `src/` and are reachable
two ways: `types` for a plain consumer, `source` for one asking for the condition. It carries a
non-literal `CompTimeArgs` call in its source, so the first-party diagnostic scoping guard
(CTA001 / CTA003 from a dependency's own internals) survives. `build-all.mjs` packs and unpacks
it into the matrix root before building, rather than `npm install`-ing it, because the matrix
root's `package.json` is the baked toolchain manifest. A second app,
`apps/smoke-types-in-src`, consumes the same fixture with no custom conditions, so its
definitions are found through plain `types`.

**The contracts.** `packaged-sources.spec.ts` inverted: no manifest declares a `source`
condition, no tarball carries `src/` or a `.d.ts.map`, declarations are still there, and the
spec/test/tsbuildinfo leak check stays. Its package list grew from 14 to 16 (`@mionjs/run-types`
and `@mionjs/drizzle-orm` both carried the condition and neither was listed).
`repo-contracts.test.ts` replaced its run-types-only block with three that cover every
publishable package: no source entry in `files`, `.d.ts.map` excluded from every shipped dist
dir, `stripSourceCondition` leaving no `source` anywhere and changing nothing else, and every
workspace `source` target pointing at a file that is really there.

## Not done

No website change. The one page that mentions the condition
(`02.runtypes/02.guide/10.linting.md`) is about a consumer's own monorepo resolving its
workspace packages from source, which still works.
