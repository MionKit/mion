---
type: feature
spec: full-plan
status: done (2026-09-02)
created: 2026-09-02
---

# One docs site: mion.pages.dev with /rpc, /runtypes and /benchmarks subsites

> Shipped as specified, with these differences:
>
> - **Cloudflare variable names keep their historical meaning.** `CLOUDFLARE_PAGES_PROJECT`
>   (the repo secret, set to `runtypes`) stays the runtypes project, which now receives the
>   redirect-only upload; `CLOUDFLARE_PAGES_PROJECT_MION` (default `mion`) receives the site.
>   Re-pointing `CLOUDFLARE_PAGES_PROJECT` at mion, as the spec first said, would have swapped
>   the two deploys under the existing secret. No owner action on secrets is needed.
> - **The rpc devtools section was trimmed on the way** (user amendment): the pure-functions
>   page is gone (pure functions are a RunTypes feature, `/runtypes/guide/pure-functions`),
>   its mion-only material (named server mappers, `allowServerMapper`) moved into the client
>   flow page, and the remaining pages are `linter`, `vite`, `nextjs`. Old paths redirect.
> - The subsite list lives at `app/utils/subsites.ts` (auto-imported), not `app/subsites.ts`.
> - The link and redirect contracts are their own file, `packages/devtools/test/website-links.test.ts`.
> - Landing pages use their frontmatter `seo.title` as the whole title (`titleTemplate: '%s'`);
>   docs pages end with the subsite's name.
> - The runtypes wordmark was retired: one mion logo everywhere, plus the subsite word.

## Problem

`container/website/` is one Nuxt 4 + Docus 5.9.0 install that builds TWO static sites, picked by
`MION_SITE`: runtypes.pages.dev from `sites/runtypes/` and mion.pages.dev from `sites/mion/`. Two
Nuxt builds, two Cloudflare Pages projects, two domains, cross links that leave the site, and every
script, workflow and test carries a `--site` loop.

Wanted: ONE static site at mion.pages.dev, built once, deployed once, no server or proxy. mion is
the product name; each subsite is one feature of it, and more will follow, so the first one is
named after its feature (the RPC framework), not after the product:

| URL | What |
| --- | --- |
| `/` | New root landing: a short hero, then a small version of each subsite intro |
| `/rpc` | Today's mion home page, then `/rpc/introduction/...`, `/rpc/server/...` |
| `/runtypes` | Today's runtypes home page, then `/runtypes/guide/...`, `/runtypes/playground` |
| `/benchmarks` | New benchmarks landing with a summary of both, then `/benchmarks/rpc/...` and `/benchmarks/runtypes/...` |

Each subsite keeps its own colour theme and sidebar. The header shows the mion logo plus the
subsite name (`rpc`, `runtypes`, `benchmarks`) and three tabs to switch subsite. Old URLs on both
domains redirect.

## Settled decisions

- Subsite ids are `rpc`, `runtypes`, `benchmarks`. The benchmark groups use the same ids
  (`/benchmarks/rpc/hello-world`, `/benchmarks/runtypes/validation`).
- Root landing uses the rpc theme; each intro block on it carries its own subsite colours.
- The playground moves to `/runtypes/playground`.
- One logo (mion's) everywhere, with the subsite name next to it. The runtypes wordmark is
  retired. One favicon for the whole site (mion's).
- runtypes.pages.dev stays alive as a redirect-only Pages project (a `_redirects` file), so every
  old link and the JSON Schema dialect id keep resolving.
- `MION_SITE`, `MION_WEBSITE_PARALLEL`, `site.config.ts` and every `--site` flag are removed, not
  kept as a no-op.

## How Docus makes this possible (verified in the docus 5.9.0 package)

- `app.config.navigation.sub = 'aside' | 'header'` turns on **sub navigation**
  (`docus/app/composables/useSubNavigation.ts`): the sidebar shows only the children of the
  top-level nav section the current route is in, so a content root with `rpc/`, `runtypes/`
  and `benchmarks/` dirs gives per-subsite sidebars for free. Without that key Docus shows one
  sidebar with every subsite nested, which is exactly what this spec avoids.
- The `landing` collection is queried by `route.path` (`docus/app/templates/landing.vue`), so
  extra landing pages only need a page file per subsite root plus `*/index.md` in the collection.
- Layer file overrides: a file at the same path in `app/` replaces Docus' one
  (`app/components/app/AppFooterRight.vue` already does this).

## Plan

### 1. One content tree

Move both trees under `container/website/content/` (Docus' hardcoded root, so the `cwd`
override in `content.config.ts` goes away):

```
content/
  index.md                    NEW root landing
  01.rpc/
    .navigation.yml           title: rpc, icon
    index.md                  <- sites/mion/content/index.md
    01.introduction/ 02.server/ 03.drizzle-orm/ 04.client/ 05.run-types.md
    06.devtools/ 07.platforms/ 09.articles/          (08.benchmarks leaves)
  02.runtypes/
    .navigation.yml           title: runtypes, icon
    index.md                  <- sites/runtypes/content/index.md
    01.introduction/ 02.guide/ 03.ai-integration/ 08.diagnostics.md   (07.benchmarks leaves)
  03.benchmarks/
    .navigation.yml           title: benchmarks, icon
    index.md                  NEW benchmarks landing
    01.rpc/                   <- sites/mion/content/08.benchmarks/*  (.navigation.yml title: rpc)
    02.runtypes/              <- sites/runtypes/content/07.benchmarks/* (.navigation.yml title: runtypes)
```

**Each subsite gets its OWN sidebar.** The tree above is the storage layout only. Docus' default
sidebar (the whole `docs` navigation, all subsites nested) is NOT what ships: with
`navigation.sub` set (step 3) Docus' own `useSubNavigation` computes `sidebarNavigation` as the
children of the top-level section the current route is in, so on `/rpc/...` the sidebar lists
only Introduction, Server, Drizzle, ...; on `/runtypes/...` only Introduction, Guide, AI
integration, Diagnostics; on `/benchmarks/...` only the rpc and runtypes groups. No subsite ever
sees another subsite's sections. The mobile menu is covered the same way (step 3,
`AppHeaderBody.vue` override); the search palette stays site-wide on purpose.

Use `git mv`. Keep the existing two-digit prefixes; gaps are harmless (runtypes already has one).
`sites/` becomes `sites/rpc/theme.css`, `sites/runtypes/theme.css` and a new
`sites/benchmarks/theme.css`, nothing else: `sites/mion/Logo.vue` moves to
`app/components/content/MionLogo.vue` (shared), `sites/runtypes/Logo.vue` is deleted,
`sites/*/app.config.ts` merge into `app/app.config.ts` (step 5) and `sites/*/public/` merge into
the shared `public/` (banners/, mion's favicon set, one merged `_redirects`, step 7).

Mounts: `scripts/website/site.mjs` `MOUNT_DIRS` adds `content`, `MOUNT_FILES` drops
`site.config.ts`; `.containerignore` mirrors both.

### 2. Collections and routes

`content.config.ts` keeps overriding Docus' two collection names (still load-bearing) but no cwd:

```ts
docs:    source: {include: '**', prefix: '/', exclude: ['**/index.md']}
landing: source: {include: '**/index.md', prefix: '/'}
```

No nested `index.md` exists today; note in the file that any future `<dir>/index.md` becomes a
landing page, not a docs page.

Subsite landings: `app/components/SiteLanding.vue` (copy of
`docus/app/templates/landing.vue`, ~30 lines: query `landing` by `route.path`, `useSeo`
type `website`, og image) and three one-line pages `app/pages/{rpc,runtypes,benchmarks}/index.vue`
(`<template><SiteLanding /></template>`). Static segments always outrank Docus' catch-all
`[[lang]]/[...slug].vue`, so no route ranking to reason about. `/` stays Docus' own landing
route. Push the three roots into `nitro.prerender.routes` in `nuxt.config.ts`.

Docs pages: override `app/pages/[[lang]]/[...slug].vue` with a copy of Docus' file changed in
two places: the prev/next query is restricted to the current subsite
(`queryCollectionItemSurroundings('docs', route.path, {fields: ['description']}).where('path', 'LIKE', '/<id>/%')`,
otherwise the last rpc page links "next" to the first runtypes page), and a
`useHead({titleTemplate: '%s - <subsite title>'})` so runtypes pages are not titled "- mion".
A header comment records the docus version it was copied from; a contract test pins that to
`_deps/package.json` so a docus bump forces a re-diff.

`nuxt.config.ts`: drop the `#site` alias, the `site.config` import and the per-site
`publicAssets` entry; set `site: {name: 'mion', url: 'https://mion.pages.dev'}` (today `url` is
unset, so canonical links and the sitemap have no host). Delete `site.config.ts`.

### 3. Subsite switch: one source of truth

`app/subsites.ts`:

```ts
export const SUBSITES = [
  {id: 'rpc', label: 'rpc', title: 'mion', path: '/rpc'},
  {id: 'runtypes', label: 'runtypes', title: 'RunTypes', path: '/runtypes'},
  {id: 'benchmarks', label: 'benchmarks', title: 'Benchmarks', path: '/benchmarks'},
] as const
```

`app/composables/useSubsite.ts`: the entry whose `path` prefixes `route.path`, else `rpc`
(root landing, 404). Consumers:

- `app/plugins/section-class.ts` (rename to `site-attr.ts`): `useHead({htmlAttrs: {'data-site': id}, bodyAttrs: {class}})`,
  reactive, so the attribute is in the prerendered HTML (no colour flash). Its width regexes get
  the `/runtypes/` and `/benchmarks/` prefixes.
- `app/components/app/AppHeaderCenter.vue` override: the three tabs (`UNavigationMenu`,
  active by prefix) next to the search button, on every page including landings.
- `app/components/content/AppHeaderLogo.vue`: renders `<MionLogo />` followed by the current
  subsite's `label` as text (`rpc`, `runtypes`, `benchmarks`) painted with `var(--site-accent)`,
  in a slightly smaller size than the logo wordmark (about 0.8 of its height, baseline aligned),
  separated by a thin divider. Same logo on every page; only the word changes. On the root
  landing the word is omitted.
- `app/components/docs/DocsAsideLeftTop.vue` override: empty (Docus would repeat the section
  anchors at the top of the sidebar; the header tabs already do that job).
- `app/components/app/AppHeaderBody.vue` override (the mobile menu): Docus renders the FULL
  navigation tree there; ours renders the three subsite tabs and then `sidebarNavigation` from
  `useSubNavigation()`, so the phone menu is the current subsite's sidebar, nothing more.

`app/app.config.ts` sets `navigation: {sub: 'aside'}`. That single key is what turns Docus'
one-tree sidebar into a per-subsite one (`docus/app/composables/useSubNavigation.ts`,
`sidebarNavigation`): the desktop sidebar (`DocsAsideLeftBody.vue`) already reads it, so no
override is needed there.

### 4. Three themes in one CSS root

Tailwind v4 compiles one root and `@theme` must sit in it, so the brand ramp is declared once in
`app/assets/css/mion.css` as pure references, and each subsite fills the references under an
attribute selector:

```css
/* mion.css */
@theme static {
  --color-brand-50: var(--site-brand-50);   /* ... through 950, no hex here */
}
@import '../../../sites/rpc/theme.css';
@import '../../../sites/runtypes/theme.css';
@import '../../../sites/benchmarks/theme.css';
```

```css
/* sites/runtypes/theme.css */
[data-site='runtypes'] {
  --site-brand-50: #f4f9fc;  /* ... 950 */
  --site-accent: #00a9ea; --site-gradient-from/-to/-mix; --site-hue: 201; --site-hue-good: 130;
}
[data-site='runtypes'].light, .light [data-site='runtypes'] { /* per-mode overrides */ }
```

On `<html data-site>` this works with no more: the overridden `--site-brand-*` sit on the root
element, so `--color-brand-*` and Nuxt UI's `--ui-primary` resolve to them. For a **block** on
the root landing carrying its own colours (`::div{data-site="runtypes"}` around an intro block),
custom properties resolved on `:root` do not see the block's values, so `mion.css` adds one
generic bridge that re-resolves them where the attribute sits:

```css
[data-site] {
  --color-brand-50: var(--site-brand-50); /* ... 950 */
  --ui-color-primary-50: var(--color-brand-50); /* ... 950 */
  --ui-primary: var(--color-brand-500);
  --site-title-gradient: linear-gradient(/* moved here from :root, same stops */);
}
.dark [data-site], [data-site].dark { --ui-primary: var(--color-brand-400); }
```

`sites/rpc/theme.css` is today's `sites/mion/theme.css` with the new selector.
`sites/benchmarks/theme.css`: a third ramp built with the OKLCH recipe in
`docs/done/website-per-site-color-schemes.md` (same lightness and chroma per shade, new hue).
Playwright `tests/theme.spec.ts` checks `/`, `/rpc`, `/runtypes`, `/benchmarks` in one run,
reading each subsite's tokens from its `[data-site]` block.

### 5. One app config, SEO per subsite

Merge `sites/*/app.config.ts` into `app/app.config.ts`: mion's `seo` and `docus` block, footer
credits "mion", `github` plus `rootDir: 'container/website'` (today the "Edit this page" link
has no rootDir and points at a path that does not exist), `docus.github.dir: 'container/website/content'`,
runtypes' `ui.prose.codeIcon` map (harmless site-wide), `ui.colors.primary: 'brand'`,
`navigation.sub`. Landing pages keep their own `seo` frontmatter; docs pages get their title
template from step 2.

### 6. The two new landing pages

`content/index.md` (root, simplest wording on the site): a short hero, then three
`::u-page-section` blocks, each wrapped in `::div{data-site="<id>"}`: the subsite's one-line
promise, two or three sentences from its intro, a "Read the docs" button to `/<id>` and a
second button to its quick start (`/rpc/introduction/quick-start`,
`/runtypes/introduction/quick-start`, `/benchmarks/rpc/hello-world`). No typed titles, no
twoslash cards; those stay on the subsite homes.

`content/03.benchmarks/index.md`: a hero, then one section per family: the rpc server summary
(`:bench-chart{bench="servers-hello-world" metric="requests"}`, as `01.rpc/index.md` already
does for heavy validation) and the runtypes validation summary (the `::perf-bars` block lifted
from the runtypes home page), each ending in links to its full pages.

### 7. Redirects

`public/_redirects` (mion.pages.dev): one splat rule per old top-level mion section
(`/introduction/* /rpc/introduction/:splat 301`, `server`, `drizzle-orm`, `client`, `devtools`,
`platforms`, `articles`), `/run-types` and `/run-types/*` to `/rpc/run-types` (folds the three
existing rules), and the four old benchmark pages listed one by one (`/benchmarks/hello-world`
to `/benchmarks/rpc/hello-world`, ...; a `/benchmarks/*` splat would loop on the new paths,
since Pages applies redirects before static files).

`container/website/legacy-runtypes/_redirects` (runtypes.pages.dev, redirect-only deploy):
`/playground`, `/benchmarks/*` to `/benchmarks/runtypes/:splat`, the three old guide renames to
their new `/runtypes/guide/...` targets, then `/* https://mion.pages.dev/runtypes/:splat 301`.
Plus a one-line `index.html` so the upload is never empty.

### 8. Scripts, env, CI, deploy

- `scripts/lib/env.mjs`: drop `SITES`, the `MION_SITE` and `MION_WEBSITE_PARALLEL` rows;
  `.env.sample` lines 41 and 52 go with them.
- `scripts/rt.mjs` `runWebsite`: drop `--site`, `forEachSite`, the `both` handling.
- `scripts/website/site.mjs`: `config()` loses `site`, per-site volumes and `parallel`;
  `outputDir()` is `.output`; `envArgs` drops `MION_SITE`; `ensureMionDists()` runs
  unconditionally (the rpc home hovers are now always part of the build); `runAsync` prefixing
  goes.
- `scripts/website/build.mjs`: one Nuxt build, one check, one zip; `--parallel` and
  `warnIfLowMemory` removed.
- `scripts/website/check-static.mjs`: ONE gate. Walk every `.md` under `content/`
  (nested `index.md` routes to its dir, `/rpc`), and per page assert: prerendered, pictures
  shipped, every `::bench-table` dataset and hover detail present (the runtypes checks, now
  keyed by component rather than by site), every `:bench-chart` / `:server-bench-table` div
  in the HTML and its dataset populated (the mion checks). `CHECKS` map and `--site` go.
- `scripts/website/serve.mjs`: `publicRoot()` takes no site.
- `scripts/check-code-imports.mjs`, `container/website/scripts/check-links.mts`,
  `check-unused-examples.mts`: scan `container/website/content`.
- Workflows: `ci.yml` one `pnpm rtx website check`; `pr-heavy.yml` and `release-gate.yml` one
  `container-build`; `website-deploy.yml` drops the `site` input, builds once, checks once,
  uploads `.output/public`, deploys it to `CLOUDFLARE_PAGES_PROJECT_MION` (default `mion`) and
  the `legacy-runtypes/` dir to `CLOUDFLARE_PAGES_PROJECT` (default `runtypes`, the old project).
  Comments in the workflow header updated.

### 9. Links

- Rewrite every root-relative link in the moved pages (about 150: `](/guide/...)`, `to="/..."`,
  `to: /...`, `redirect: /...`, `href="/..."`) to its prefixed form; cross-site absolute links
  (`https://runtypes.pages.dev/guide/validation` in rpc pages, `https://mion.pages.dev/server/...`
  in runtypes pages) become relative `/runtypes/...` and `/rpc/...`; benchmark links point at
  `/benchmarks/<id>/...`; the playground link at `/runtypes/playground`. Do it with a
  one-off script, commit the result, then delete the script.
- New contract test `website-internal-links` (see Tests) is the guard that makes this move safe.
- Outside the site: `README.md` (benchmark links, the RunTypes site link), `CLAUDE.md`,
  `SETUP.md`, `container/website/README.md`, `packages/{run-types,bin,devtools,drizzle-orm}/README.md`,
  the three `package.json` `homepage` fields, `scripts/release/build-binaries.mjs` (the generated
  binary README), `container/website/app/components/app/AppFooterRight.vue`,
  `docs/json-schema-2020-12-javascript.md` (the dialect id; the legacy redirect keeps the old
  one resolving too), `.claude/skills/website-browser/SKILL.md`,
  `docs/todos/first-unified-release.md` line 64. `ts-go-runtypes/internal/convert/print.go`
  links `/guide/converting-forms`, a page that does not exist: point the three messages at
  `https://mion.pages.dev/runtypes/guide/source-conversion` (and update any Go test pinning them).

Suggested commit order: 1 content move + collections, 2 subsites/header/themes, 3 app config +
landings, 4 scripts/env/CI, 5 redirects + links, 6 tests + docs. Each commit builds.

## Tests

`packages/devtools/test/website-theme-contracts.test.ts`:

- `website-theme-tokens`: three `sites/*/theme.css`, each with a `[data-site='<id>']` block
  holding hex `--site-brand-50..950` and the six tokens; three different 500 shades; `mion.css`
  holds exactly one `@theme static` block whose values are all `var(--site-brand-N)` and no hex,
  and imports every `sites/*/theme.css`; the `[data-site]` bridge covers all eleven shades for
  both `--color-brand-*` and `--ui-color-primary-*`.
- `website-sites-mirror` becomes `website-subsites`: `SUBSITES` ids equal the `sites/*` dirs,
  each has `content/<NN>.<id>/index.md` and `.navigation.yml` and `app/pages/<id>/index.vue`;
  no `Logo.vue` under `sites/` (one shared `MionLogo.vue`); no workflow mentions `--site` or
  `MION_SITE`; one favicon at `public/favicon.ico` and none under `sites/`.
- The page override header names the docus version in `_deps/package.json`.

`packages/devtools/test/repo-contracts.test.ts`:

- `website-content-prefixes`: one tree, three top-level subsite dirs, two-digit rule unchanged.
- NEW `website-internal-links`: every root-relative link in `content/**/*.md` and
  `.navigation.yml` (anchors stripped) resolves to a content page (prefix-stripped path), a
  subsite root, `/runtypes/playground`, or `/bench-data/...`; and no link points at
  `runtypes.pages.dev` or `mion.pages.dev` (in-site links are relative).
- Thin-README rule: expects `https://mion.pages.dev/runtypes` instead of `https://runtypes.pages.dev`.
- `website-test-counts` HOME and the mion bench test `MION_CONTENT` paths follow the move.
- `_redirects`: every rule's target that is in-site resolves like the links above.

`container/website/tests/theme.spec.ts` (manual, Playwright): four routes in one run, and the
header shows the mion logo plus the subsite word on each.
`pnpm run check:env` clean after the registry edits. `go -C ts-go-runtypes test ./internal/...`
for the message change.

## Docs

- `container/website/CLAUDE.md`: rewrite the "two sites" header, the site-selection section, the
  Styling section (selector form, bridge, `sites/` now holds only themes), the header logo note,
  the Development command list (no `--site`), Content organization (the new tree).
- Root `CLAUDE.md` (Containers bullet, README rule link), `SETUP.md`, `container/website/README.md`,
  `container/website/CONTAINER.md`, `.claude/skills/website-browser/SKILL.md`.
- `docs/done/merge-websites-one-nuxt-two-sites.md` stays as history; this spec moves to
  `docs/done/` when shipped.

## Fuzzing

Not a candidate: a content move with no runtime oracle beyond the link and prerender gates above.

## Out of scope

- Any prose change beyond links and the two new landing pages.
- Changing the mion or runtypes colours; only the benchmarks ramp is new.
- Per-subsite favicons or logos, per-subsite search scoping, i18n.
- Deleting the runtypes Cloudflare project (it becomes the redirect host).

## Merge order

A pre-existing, unrelated finding surfaced while building the site (the twoslash hover
cards cannot resolve the drizzle packages, whose dist sits under `.dist/esm/src`). It was
delegated to its own session and spec, `docs/todos/twoslash-drizzle-dist-mount.md`; that
fix's PR merges BEFORE this one, after which this branch rebases on `main` and drops its
copy of that todo.

## Owner actions

- After the first deploy, open `https://runtypes.pages.dev/guide/validation` and confirm it lands
  on `https://mion.pages.dev/runtypes/guide/validation`, and `https://mion.pages.dev/server/routes`
  on `https://mion.pages.dev/rpc/server/routes`.

## Done when

- `pnpm rtx website build` produces one `.output/public` and `check --static` passes on it,
  covering `/`, the three subsite homes, every docs page and every benchmark dataset.
- In the browser: `/rpc`, `/runtypes` and `/benchmarks` each render their old home page with
  their own colours; the header shows the mion logo plus the subsite word and the tabs switch
  subsite; the sidebar shows only the current subsite's sections (benchmarks split into rpc and
  runtypes groups); prev/next never crosses a subsite; the root page shows each intro block in
  its subsite colours.
- Old mion URLs redirect within mion.pages.dev; `legacy-runtypes/_redirects` covers every old
  runtypes URL.
- `MION_SITE`, `--site`, `site.config.ts` and `MION_WEBSITE_PARALLEL` no longer exist anywhere
  (`git grep` clean); `pnpm run check:env` passes.
- `pnpm test`, `pnpm run lint`, `pnpm run format`, `go -C ts-go-runtypes test ./internal/...` green;
  the new link contract passes.
- Docs listed above updated; this spec moved to `docs/done/`.
