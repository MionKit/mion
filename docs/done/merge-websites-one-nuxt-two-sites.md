# One Nuxt install, two sites: fold mion's website into the container (merge master plan, step 4)

**Status:** done (2026-08-24)
**Created:** 2026-08-24

Step 4 of [../todos/merge-ts-runtypes-into-mion-master-plan.md](../todos/merge-ts-runtypes-into-mion-master-plan.md).
Settled decision 3: the single `container/website/` Nuxt codebase builds TWO separate static
sites (runtypes.pages.dev and mion.pages.dev, both Cloudflare Pages), and the host-run
`website/` directory plus the GitHub Pages deploy are retired.

The spec listed [unify-workspace-and-toolchain.md](../todos/unify-workspace-and-toolchain.md)
(step 3) as a prerequisite. It turned out not to be one: `packages/examples` was already merged
by step 2 and both of its typecheck programs were green, and nothing here needs lerna or nx
gone. Step 4 landed first.

## Owner actions

- **STILL OPEN:** create the Cloudflare Pages project for mion.pages.dev and confirm the
  existing `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets cover both projects. The
  deploy workflow is wired and will fail on the mion step until the project exists; the
  runtypes deploy is unaffected. Optionally set the `CLOUDFLARE_PAGES_PROJECT_MION` repo secret
  if the project is not literally named `mion`.

## What shipped

### Site selection

`RT_SITE=runtypes|mion` (registered in the env REGISTRY, default `runtypes`) picks the content
tree, the app config and the public assets. Three small files implement it:

- `container/website/site.config.ts` reads and validates `RT_SITE`, exports `SITE` + `SITE_DIR`.
- `nuxt.config.ts` aliases `#site` to that dir (so `app/app.config.ts` and the header logo
  resolve the right one at build time) and layers `sites/<site>/public` over the shared
  `public/` through nitro's `publicAssets`.
- `content.config.ts` redefines Docus' `docs` + `landing` collections with the site's content
  dir as their `cwd`.

That last one is the load-bearing piece and it needed investigating. Docus hardcodes
`joinURL(options.rootDir, 'content')` and `@nuxt/content` exposes no option to move it. What
does work is layering: `@nuxt/content` loads one `content.config.ts` per Nuxt layer and merges
them **by collection name with the project applied last**, so redefining `docs` and `landing`
replaces Docus' pair. The names are load-bearing — Docus' own pages, search and sitemap query
them literally. The `cwd` must be absolute: `@nuxt/content`'s `~~/` expansion drops the slash.

Layout:

```
container/website/
  sites/runtypes/{app.config.ts, Logo.vue, content/, public/}
  sites/mion/    {app.config.ts, Logo.vue, content/, public/}
  public/          shared (fonts, favicons, generated bench-data/ + playground-app/)
  app/             shared components, layouts, pages, playground, composables
```

Everything else is shared and was already identical between the two trees. The only components
that differed at all were `AppHeaderLogo.vue` (now a two-line wrapper over `sites/<site>/Logo.vue`)
and cosmetic CSS prefixes in `TwoslashCode.vue`.

Build output is per site at `container/website/.output/<site>/public`, and the `.nuxt` / `.data`
container volumes are per site too, so two sequential builds cannot contaminate each other.

### mion's content

Moved to `sites/mion/content/` and renumbered to two-digit prefixes (the contract
`website-content-prefixes` now covers both trees). Padding alone would have **reordered the
nav** — Nuxt Content sorts prefixes as text, so mion's live order was Introduction, Server,
Drizzle, Client, … — so the sections were renumbered to preserve it exactly:
`01.introduction, 02.server, 03.drizzle-orm, 04.client, 05.run-types.md, 06.devtools,
07.platforms, 08.benchmarks, 09.articles`. URLs are unaffected; the prefix is stripped.

Fixed while moving: `devtools/` had no `.navigation.yml`, `articles/.navigation.yml` was titled
"Introduction", and the SEO image pointed at an absolute `https://mion.io/...` URL.

### run-types section

Collapsed from three pages (499 lines) to one, `05.run-types.md`. About two thirds of it
duplicated the runtypes guide, and its "Type Compiler" section still documented
`"reflection": true` in tsconfig and the `@reflection never` JSDoc tag, both deepkit-era and
wrong for RunTypes. The new page introduces what RunTypes does for mion, links across to
runtypes.pages.dev for the real guide, and keeps the mion-specific caveats (route type
annotations, union ordering, the `@mionjs/*` eslint rules). The competitor comparison matrices
were dropped. `sites/mion/public/_redirects` 301s the three old URLs.

### Code examples

Fences that were complete, runnable examples became files in `packages/examples` behind
`<code-import>`; deliberately partial fragments and wrong-vs-right contrast pairs stayed as
fences. New examples: `router/serializer-modes.ts`, `router/serializer-per-route.ts`,
`router/binary-options.ts`, `client/server-mappers-{client,server}.vite.config.ts`,
`drizzle/drizzle-length-buffer.ts`, `cloudflare/cloudflare.vite.config.ts`, plus a
`type-mion-headers-*` marker pair in `packages/router/src/types/context.ts`.

Converting them caught a real doc bug: the serialization page documented
`initRouter({serializer: ...})` three times, and there is no `initRouter` export — the function
is `initMionRouter` and it is async.

### Dependencies and the image

**No dependency changed, so no image rebuild was needed.** The spec expected mion-only extras.
In fact the only one was `vue-writer`, used solely by mion's `TypedTitle.vue`, and the
container had already replaced that component with a dependency-free version whose props are a
strict superset. `billboard.js` (the charts) was already in `_deps`.

Likewise, the benchmark chart data the spec wanted frozen as static content was **already
committed**: `container/website/app/components/content/charts/` is byte-identical to mion's,
and `BenchChart.vue` is too. The mion benchmark pages simply reactivated assets that were
already in the tree.

### Shared server and scripts

- `server/api/twoslash.post.ts` now mounts both scopes. The `@mionjs/*` mounts read `.dist/esm`,
  so `site.mjs` runs `build:mion` before serving the mion site (without it every hover card on
  the mion home page renders an error and the build still exits 0). `@mionjs/devtools` ships
  nested per-entry build trees and classic node resolution ignores `exports`, so it gets
  generated entry shims. Third-party `.d.ts` come in through a named allowlist (today just
  `drizzle-orm`), mirrored by `TWOSLASH_EXTERNAL_DEPS` in `scripts/website/site.mjs`, which
  mounts that one dir rather than the whole `node_modules`.
- `scripts/check-code-imports.mjs` now scans both trees. It was pointed at `website/content`,
  which means the container's own `<code-import>` blocks had never been checked by the
  pull-request gate; they are now (240 blocks across both sites).
- `check-links.mts` / `check-unused-examples.mts` iterate both trees, discovered from `sites/`
  rather than listed.
- `check-static.mjs` is site-aware. runtypes keeps the bench-table + bench-data replay; mion
  gets a gate that asserts every content page prerenders with its chart components, because its
  charts are build-time imports (a missing dataset is already a build failure there, but a page
  dropping out of the build is not).
- `pnpm rtx website … --site runtypes|mion` on every subcommand; `build` also takes
  `--site both` and defaults to it.

### Deletions

`website/` (the whole tree, including `tests/twoslash.spec.ts`, which was already dead — all
three routes it navigates to 404 — and `not-rendered/`), `.github/workflows/nuxtjs.yml`, the
root `pages-build` and `copy-benchmarks` scripts, `scripts/copy-benchmarks.js`,
`packages/examples/src/twoslash-test/` (its only consumer was that spec), and the now-dead
`website/**` ignore entries in `.oxlintrc.json`, `.oxfmtrc.json`, `eslint.config.js`,
`.prettierignore` and the `pnpm-workspace.yaml` comment.

### Deploy

`website-deploy.yml` gained a `site` input (`both` by default) and builds + deploys each site
to its own Pages project (`CLOUDFLARE_PAGES_PROJECT`, `CLOUDFLARE_PAGES_PROJECT_MION`), keeping
the `--branch=prod` pin, the main-or-prod ref allow-list and the `verify-live` gate. `ci.yml`
smokes both sites and `release-gate.yml` production-builds both.

**This changes mion's deploy cadence**: its docs used to publish on every push to `main` via
GitHub Pages, and now publish on the same manual, release-gated dispatch as the runtypes docs.

## Findings fixed along the way

- `packages/examples/src/_homepage/home-client.ts` had a twoslash `^?` caret one column past
  the end of its line, which made the whole sample throw and rendered an error card on the mion
  home page. Pre-existing; fixed.
- The `initRouter` / `initMionRouter` doc bug above.
- `scripts/check-code-imports.mjs` never checking the runtypes tree.
- mion shipped two byte-identical copies of the same banner, one unreferenced. Dropped.
