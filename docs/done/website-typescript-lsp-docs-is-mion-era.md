---
type: docs
spec: guidelines
status: done
created: 2026-07-26
completed: 2026-07-26
---

# `container/website/typescript-lsp-docs.md` is a mion-era scratch doc

## Origin

Found 2026-07-26 while implementing
[stale-docs-drift-cluster.md](stale-docs-drift-cluster.md), during that
todo's verification grep for residual `mion` references under
`container/website/`. It is **not** one of that todo's ten findings, so it was
left alone and recorded here instead of silently widening the fix.

## Evidence

`container/website/typescript-lsp-docs.md` (269 lines) is investigation notes for
wiring the twoslash / LSP type-hover pipeline, written against **mion**, not
RunTypes. Every package it names belongs to the other project:

- `import {initClient} from '@mionjs/client'` (line 38)
- `import type {MyApi} from '@mionjs/examples/src/introduction/about-server.ts'` (line 59)
- `import {createRouter} from '@mionjs/router'` (line 155)
- virtual-FS entries for `@mionjs/router`, `@mionjs/server`, `@mionjs/client`
  `.d.ts` (lines 182-184, 227-230)
- "✅ Always import from `@mionjs/*`" (line 260)

`packages/examples/src/introduction/about-server.ts` does not exist in this repo,
and none of the `@mionjs/*` packages do. The file is not referenced by
`nuxt.config.ts`, `CONTAINER.md`, `CLAUDE.md`, or `AGENTS.md` — it sits loose in
`container/website/` with no inbound link.

Same class as findings 1 and 2 of the drift cluster (website files describing the
wrong project), which is why it turned up in the same grep. Those two were fixed
by that todo; this one was outside its stated scope.

## What to decide

Whether the twoslash / LSP notes still carry knowledge worth keeping.

- **If yes** — port them to RunTypes: rewrite the package names and the virtual-FS
  layout against what `server/api/twoslash.post.ts` and `server/utils/repo-root.ts`
  actually load today (first-party source + built `.d.ts` under `packages/`, plus
  the drizzle-orm allowlist), and link it from `container/website/CLAUDE.md` so it
  stops being an orphan.
- **If no** — delete it. It is unreferenced scratch work, and an unlinked file
  full of another project's imports is exactly the kind of thing that misdirects
  an agent grepping the website tree.

Read the file before choosing: the decision is whether its *content* (how twoslash
resolves types through a virtual file system) is still accurate for this repo's
pipeline, independent of the wrong package names on the surface.

## Done when

`container/website/` contains no file describing another project, and whatever
survives is reachable from `CLAUDE.md` or `CONTAINER.md`. Verify with
`grep -rni "mionjs" container/website/` returning nothing.

## Out of scope

The rest of `container/website/` — `CLAUDE.md`, `AGENTS.md`, `README.md`, and
`CONTAINER.md` were rewritten by the drift-cluster todo and are current.

## What actually shipped (2026-07-26)

The investigation found the doc was the visible corner of a dormant, partly broken
feature. The file itself turned out to be two things, neither worth porting:

- **Lines 1-69 were a work order**, not documentation ("Create branch
  `typescript-lsp-docs` before starting", "commit after each stage", "Do not modify
  any other package other than examples") for a feature that has since shipped.
- **Lines 72-267 were a generic Twoslash explainer** that duplicates upstream
  `@shikijs/twoslash` docs, using mion package names as its examples. Everything
  actionable in it was already realized in `server/api/twoslash.post.ts`, whose own
  comments document the same mechanics against the real implementation.

So it was **deleted**, not ported. The decision above ("read the file before
choosing") resolved to delete on the merits.

### The real finding: the twoslash VFS was broken

While confirming whether the doc still described the pipeline accurately, the
pipeline turned out **not to work at all**. `twoslash.post.ts` mounts each package's
built `.d.ts` into a virtual `node_modules` keyed by npm package name, and that list
still used the **pre-scope** name `ts-runtypes`. Every example imports the scoped
names (`@ts-runtypes/core` x76, `/formats` x21, `/schema` x8,
`@ts-runtypes/devtools/vite` x3), so nothing resolved, and twoslash throws on
unresolved imports rather than degrading.

Verified against the real TypeScript resolver with the same compilerOptions the
endpoint passes: **0 of 4 specifiers resolved before, 4 of 4 after.**

CI never caught it because the website is containerized: repo CI runs
`pnpm rtx website check` (serves-a-page), while the twoslash assertion lives in
`check --docs` (verify-docs), a manual lane.

### Shipped

1. **Deleted** `container/website/typescript-lsp-docs.md`.
2. **Deleted** `container/website/tests/twoslash.spec.ts` — it navigated to
   `/twoslash-test/*` routes that 404 and asserted `@mionjs/router` /
   `@mionjs/platform-node`, so it could only fail. Its real coverage (POST
   `/api/twoslash`, assert hover markup) already exists in `verify-docs`.
   `playwright.config.ts` stays (the website-browser skill uses it as its workspace
   marker), so `tests/.gitkeep` keeps its `testDir` valid.
3. **Deleted** `container/website/not-rendered/.twoslash-test/` — parked demo pages
   whose `<code-import>` target (`packages/examples/src/twoslash-test/`) does not
   exist. That emptied `not-rendered/`, so `MOUNT_DIRS` in
   `scripts/website/site.mjs` dropped it.
4. **Fixed** `server/api/twoslash.post.ts`: mount `@ts-runtypes/core` and
   `@ts-runtypes/devtools` under their published names, skip the `dist/cjs/` twin,
   rename `loadMionPackageTypes` to `loadPackageTypes`, delete the dead
   `externalDeps` loop (an empty array whose body never ran) and the false
   `drizze` to `drizzle` mapping comment, and re-point the stale `about-client.ts` /
   `about-server.ts` comment examples at files that exist.
5. **Dropped the orphaned drizzle-orm mount** in `site.mjs` and its mention in
   `server/utils/repo-root.ts` — dead once the `externalDeps` loop went.
6. **Added a regression guard**: `repo-contracts.test.ts` parses the
   `packageConfigs` literal and cross-checks it against every `@ts-runtypes/*`
   specifier the examples import, asserting the mount list is complete and uses
   scoped names. Confirmed non-vacuous: reverting the name fails both tests.
7. **Documented the gotcha** in `container/website/CLAUDE.md`, including that no
   published page uses `::twoslash-code` today.

### Reconciled Done-when

The original verification, `grep -rni "mionjs" container/website/` returning
nothing, was **too aggressive**: the surviving hit is `AppFooterRight.vue`'s live
footer credit, "born from Deepkit, matured through mionjs and RunTypes", linking to
mion.pages.dev. That is a deliberate lineage credit, not drift, and it stays. The
real bar, met here: no file under `container/website/` **describes** another
project, and the one remaining `mionjs` string is an intentional attribution.

### Not done

The feature is fixed but still dormant, and no content page exercises it. Reviving
it (a published page plus a matching example under `packages/examples/src/`) was
considered and deliberately left out. Note also that examples importing third-party
modules will not type-resolve, since only first-party packages are mounted; today
that is only the manual-install config example's `vite` import, and a comment in
`twoslash.post.ts` records the extension point.
