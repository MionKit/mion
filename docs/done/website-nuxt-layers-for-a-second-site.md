---
type: feature
spec: full-plan
status: done
created: 2026-11-14
---

# Website as Nuxt layers a second site can extend

## Problem

- `container/website/` is ONE Nuxt 4 + Docus 5.9 project hard-wired to mion.io.
- A second site, `https://pro.mion.io`, lives in the private repo mion-pro. Settled: two sites, pro's pages + build +
  deploy in mion-pro, pro reaches mion's site code only through its git submodule
  (`third_party/mion/container/website/...`), never npm. Same header, section menu and footer on both, linking each other.
- Pro must be a SUPERSET of mion's site code: load any component, composable, util, layout, plugin, asset, CSS file,
  server util and API route from mion, add its own, override by same-named file.
- Pro must NOT get mion's identity by default: `content/`, `public/_redirects`, prerender routes, routed pages
  (`/runtypes/playground`), site name / address / SEO, the `@mionjs/run-types` Vite aliases.
- ONE Nuxt install: the image `ghcr.io/mionkit/tsrt-website`, built from `container/website/_deps/`. Pro installs no
  website package. Its files are mounted into the same image.
- Blockers today:
  - Docus applied only by the CLI flag `--extends docus` (9 places in `scripts/website/site.mjs`, 4 in `_deps/package.json`).
  - `~/` imports + `css: ['~/assets/css/mion.css']` resolve to the consuming site: `BenchBar.vue:3`,
    `BenchTable.vue:3-4`, `HomeBenchTable.vue:3-4`, `RuntypesBenchBars.vue:3-4`, `ServerBenchBars.vue:3-4`,
    `VerticalIntegration.vue:3`, `nuxt.config.ts:27`.
  - `app/utils/subsites.ts`: closed `id` union, mion-only list. `app/plugins/site-attr.ts:8-10`: mion paths.
    `SubsiteMenu.vue:27`: fixed aria text. `AppFooterRight.vue`: fixed lineage paragraph.
  - `nuxt.config.ts` + `app/app.config.ts`: name, `https://mion.io`, GitHub, SEO, socials, footer text.
  - `content.config.ts`: collections with no `cwd`, so in a layer they would read the layer's own `content/`.
  - Example tool is mion data: `server/utils/code-import.ts:14-15,232`, `server/utils/repo-root.ts` (`packages/` wall,
    `IMPORTABLE_DOCS`), `server/api/twoslash.post.ts` (package list, `externalDeps`, `private-examples` checks),
    `server/api/read-file.post.ts:19`, plus the mirrored `TWOSLASH_EXTERNAL_DEPS` in `scripts/website/site.mjs`.
  - `scripts/website/site.mjs`: fixed `WEBSITE_DIR`, mounts, `tsrt-website-*` names. `build.mjs:37`, `serve.mjs:24`,
    `check-static.mjs:44`: fixed `container/website`.

## Plan

### Layout

```
website.config.json                 NEW, repo root: mion's site config (example tool values, container name)
container/website/                  mion.io site (content/, public/, .output keep their paths)
├── nuxt.config.ts                  extends mion-io + shared; name, url, prerender routes
├── content/  public/  _deps/  Containerfile  parked/  tests/      (no app/, no scripts/)
└── site-layers/
    ├── shared/     everything both sites use                $meta.name 'mion-shared'
    └── mion-io/    mion.io only: settings, playground       $meta.name 'mion-io'
```

- First built as three shared layers (generic docs site, mion parts, playground). The owner found the split
  impossible to follow (two layers that looked alike, a placeholder file repeated in both), and the second site
  needs all of it but the playground. So: ONE shared layer, and the playground sits with mion.io's own files.
- Folder is `site-layers`, never `layers`: Nuxt auto-extends every `<rootDir>/layers/*`.
- Every layer has an `app/` folder (Nuxt UI adds a Tailwind `@source` per layer `app/`; without one the scan misses it).

### What goes where

- **shared**: `extends: ['docus']`, the module list, `colorMode` and `nitro.output` in its `nuxt.config.ts`.
  `content.config.ts`. `app/app.config.ts` (the shared look). `app/assets/css/shell.css` (the generic part of the old
  `mion.css`) then `mion-pages.css` (the mion page classes; it opens with `@reference 'tailwindcss'` so Tailwind
  still compiles it; listed after `shell.css`, the order the rules were in) + `sites/<id>/theme.css` for `rpc`,
  `runtypes`, `benchmarks`, `pro`. Site chrome (`SubsiteMenu`, header, footer, sidebar), prose components, the docs
  page, layouts, plugins, composables, `utils/subsites.ts`, all of `server/` (example tool, function catalog).
  Benchmark tables + charts, `CodeCard`, tiles, diagnostics catalog, `MionLogo`, `app/components/app/AppHeaderLogo.vue`
  and `AppFooterNote.vue` (the lineage paragraph), `app/data/`, `public/{platform-logos,type-safe-apis.gif,
  fonts/code-card}`. `scripts/embed-panel-highlights.mjs` (the post-build step of any site) and
  `scripts/check-links.mts`.
- **mion-io**: mion.io's `app/app.config.ts` (github, seo, docus title / socials / github / footer), the playground
  page, the playground itself (`content/RuntypesPlayground.vue`, `components/playground/*`, `app/playground/*` with
  `.vendor/`, the three `@mionjs/run-types` Vite aliases, the Monaco exclude, generated `public/playground-app/`,
  `scripts/build-playground.mjs`). Only mion.io extends it, listed first.
- **mion site folder**: `site: {name, url}`, `nitro.prerender.routes`, `app.buildAssetsDir`, `content/`,
  `public/{_redirects,banners,favicon*,bench-data}`.
- Deleted, unused: `public/mountains.webp`, `public/fonts/MonomaniacOne-Regular.ttf`.

### Layer rules (each one checked against upstream source)

- ⚠️ `shared` goes LAST in `extends`: `extends: [mion-io, shared]`. c12 puts a layer's own nested layers right
  after it, so `shared` last keeps Docus last. Otherwise Docus outranks the layers after it and its components win
  silently. The `shared` module throws at startup if Docus is not the last layer.
- Local layers are written `./site-layers/shared` or absolute. A bare `site-layers/shared` is read as an npm name.
- No `~/` or `@/` inside a layer. Imports inside one layer are relative; from outside they use the built-in alias
  `#layers/mion-shared/...` (points at the layer ROOT, so `#layers/mion-shared/app/utils/benchFormat`).
  Layer `css` entries for own files are built from `import.meta.url`.
- `content.config.ts` in `shared` sets `cwd` from `useNuxt().options.rootDir + '/content'` (import from `nuxt/kit`),
  same split as before (`**/index.md` = landing). Collections merge by name, last wins: it replaces Docus', and a
  consumer with no `content.config.ts` gets only its own `content/`.
- Never in `shared`: `site.*`, `nitro.prerender.routes`, a routed page other than the docs catch-all, `_redirects`,
  banners, `bench-data/`. Arrays concatenate across layers and object keys fill in as defaults, so they would leak.
- Vite aliases + Monaco exclude only in `mion-io`.
- `shared` registers one inline module (`modules: [(_, nuxt) => {…}]`): runs once, `nuxt.options.rootDir` = the
  consuming site. It reads `<rootDir>/website.config.json`, sets `runtimeConfig.exampleTool`, registers
  `content:file:beforeParse` (markdown-import, code-import, function catalog) and the dev watcher plugin.

### Settings a site fills in

- `nuxt.config.ts`: `site: {name, url}`, `extends`, own `css`, own prerender routes.
- `app/app.config.ts`: `github`, `seo`, `docus.{title,description,image,socials,github,footer}` as today, plus a new
  `shell` key: `origin` (the site's own address, used to localise menu links; left out, the shell module fills it
  from `site.url`), `sections` (extra menu entries only this
  site shows), `widePages` + `flushPages` (regex sources; a local section's home page is wide without being listed),
  `menuLabel` (the aria text).
- Logo and footer note: override `AppHeaderLogo.vue` / `AppFooterNote.vue` with a same-named file. Shell-only site
  gets Docus' default wordmark and no note.
- Colours: a site adds `sites/<id>/theme.css` to its own `css`. Same `data-site` name as a shared one = override.

### Section list

- `shared/app/utils/subsites.ts`: `SUBSITES` holds full links: `https://mion.io/rpc`, `/runtypes`, `/benchmarks`,
  and `https://pro.mion.io` (`id: 'pro'`, label `Pro`, text "Paid extensions to mion.", icon `i-lucide-gem`, violet
  ramp built by the ramp rule in `app/AGENTS.md`). `id` becomes `string`.
- `useSubsite()` returns the list with each entry resolved: link starts with `shell.origin` → local path, else
  external link (`target="_blank"` not set, same tab). Site `sections` are appended.
- `subsiteForPath` picks the longest matching local path (pro's own entry is `/`).
- mion.io menu shows four entries. Pro's theme lives in `shared` because mion.io paints that entry.

### Config file

ONE file, `website.config.json`, at the root of the repo that owns the site. Read by `scripts/website/site.mjs`
(where the site is, what to mount) and by the shared layer's module (the example tool). Removes the "change both ends" pair.

- Lookup: walk up from the working directory to the first folder holding the file. None found → the mion checkout
  the script lives in. So the same command builds mion.io from mion and pro.mion.io from mion-pro, no flag, no new
  host env var.
- The file's folder IS the repo context. Every path in it is relative to that folder.
- A missing key takes its default. A missing `examples` = empty example tool, no error.

```json
{
  "site": "container/website",
  "container": "tsrt-website",
  "examples": {
    "packages": [{"dir": "packages/run-types", "name": "@mionjs/run-types"}],
    "exampleDirs": ["packages/private-examples/src"],
    "readRoots": ["packages"],
    "externalDeps": ["drizzle-orm"],
    "importableDocs": {"json-schema-2020-12-javascript": "docs/json-schema-2020-12-javascript.md"}
  }
}
```

| Key | Default | Use |
|---|---|---|
| `site` | `container/website` | the site folder, mounted at `/app`; `.output` is copied back into it |
| `container` | `<repo folder name>-website` | container + cache volume names, so two sites never share them |
| `benchData` | none | opt-in folder of benchmark result files, mounted read-only at `/bench-data` |
| `examples` | empty | the example tool, keys below |

- mion's file has this shape with all 17 packages listed. The layers are always the `site-layers/` of the mion
  checkout the script lives in, mounted at `/app/site-layers`. mion-pro's file holds `"site": "website"` and its own `examples`.
- Existing env vars keep winning over the file: `MION_WEBSITE_CONTAINER`, `MION_WEBSITE_REPO_CONTEXT`.
- The script mounts the file read-only at `/app/website.config.json`; the shared layer's module reads it from the site root.

### Example tool (`examples` key)

- `packages`: folder → published name, mounted in the twoslash virtual file system (moves out of `twoslash.post.ts`).
- `exampleDirs`: what `/api/read-file` + `/api/twoslash` may serve, what the dev watcher watches, the files loaded for
  relative imports. Replaces every `private-examples` literal.
- `readRoots`: what `<code-import>` may read (`resolveInPackages` → `resolveInRoots`). Same traversal wall.
- `externalDeps`: read from `<repo>/node_modules/<name>`. A consumer lists the `@mionjs/*` it imports here.
  Apply the `.ts` import-suffix rewrite to these too.
- `importableDocs`: name → file a page may inline with `<markdown-import>`.
- The dev watcher stamps the consuming site's own `content/` (`<rootDir>/content`), never a layer's.
- In the container the paths resolve under `MION_REPO_ROOT` (`/repo-context`).
- `scripts/check-links.mts` + `scripts/check-code-imports.mjs` keep working for mion (paths unchanged).

### Site scripts

- `scripts/website/site-config.mjs` finds and reads `website.config.json`; `site.mjs`, `build.mjs`, `serve.mjs` and
  `check-static.mjs` take the site from it (see Config file). No new flag, no new
  host env var. Another repo runs `node third_party/mion/scripts/miondevx.mjs website build` from its root.
- "Is this mion's own site" = the config's site folder is this checkout's `container/website`. Never a separate switch.

- Mounts: site dirs + config files at `/app`, `website.config.json` at `/app/website.config.json`; layers at `/app/site-layers` (read-only
  when the site is not mion's); each `readRoots` entry, each importable doc's folder, each `externalDeps` dir under
  `/repo-context`; the `benchData` folder at `/bench-data` read-only.
- Container env: `MION_WEBSITE_LAYERS=/app/site-layers`, `MION_WEBSITE_BENCH_DATA=/bench-data` when set. Parts' module
  adds `nitro.publicAssets {dir, baseURL: '/bench-data'}` when the env is set. Both in-container vars are in the env registry
  (`scripts/lib/env.mjs`).
- `.docdata`, `.output`, `.output-staging` resolve under the config file's folder / the site folder, never the mion
  checkout. `.docdata` is only created for mion's own site.
- `ensureMionDists` + `ensurePlayground` run only for mion's own site; another site gets a warning for each listed
  package with no built types. `homeTwoslashPaths` + `cmdVerifyDocs` read
  `exampleDirs` instead of the `private-examples` literal.
- Drop every `--extends docus` from `site.mjs`. The `_deps/package.json` scripts keep theirs: any edit to that file
  changes the image fingerprint and forces a local image rebuild everywhere until the image is republished.
  Nothing runs those scripts, and with the flag they no longer load the layers.
- `build.mjs`, `serve.mjs`, `check-static.mjs`: take the site dir from the same input. `build.mjs` skips the mion-only
  stages (benchmarks, playground bundle, home page counts) for another site; `check-static.mjs` runs its page checks
  for any site and the playground check only for mion's.
- `scripts/ci/lanes.mjs`: `website.config.json` feeds the website lanes and js-static.
- Generated outputs that move, all git-ignored where they were: `container/website/.gitignore`,
  `.containerignore` (add `site-layers/`), `scripts/core/clean.mjs:50-51`.

### Path updates

- Every writer and reader of an old `container/website/{app,server,sites,public}/…` path points at its layer path:
  the count, client-size and diagnostics generators, the playground build, the card tool and its manifest, the
  benchmark report, the playground tests under `packages/run-types/test/playground/` and the devtools bench tests.
- `embed-panel-highlights.mjs` moved into the shared layer (`scripts/`): the build of any site runs it.
- CI lanes are prefix-based, so only `website.config.json` was added to them.

### Checks that ran

- mion.io rebuilt from the layers: prerendered HTML identical to the pre-layers build once the new menu aria text and
  scoped-style markers are ignored; built CSS identical apart from the new `pro` theme.
- `chokidar` + `nuxt/kit` resolve from the layer folder inside the container, so the image needed no new package.
- `pnpm miondevx website build --no-bench` (ends on the static check) and `check --docs` pass.
- The home tile numbers (`test-counts.json`, `client-size.json`) were regenerated by that build.

## Tests

- `packages/devtools/test/website-theme-contracts.test.ts`: repoint to the layer paths; walk every layer for the
  colour rules. Subsite list: mion's three ids still match `content/NN.<id>/` + a theme each; `pro` has a theme and no
  content dir. Docus pin on the `[...slug].vue` copy stays.
- `website-links.test.ts`: a link may resolve to a file in any layer `public/`; CSS `@import` glob covers
  `site-layers/**`.
- `repo-contracts.test.ts`: package list guard reads `website.config.json` (`:787`); bench components must import
  the shared helpers by relative path (`:1714-1740`); CodeCard, counts, client size, playground asset guards
  follow the files.
- New contract tests (static, no container), in `website-layer-contracts.test.ts`:
  - no `~/`, `@/`, `~~/` import or `css` entry inside `site-layers/**`;
  - no layer `nuxt.config.ts` sets `site`, `nitro.prerender` or a routed page; only playground sets `vite.resolve.alias`;
  - mion's `extends` ends with `shared`; every layer has `$meta.name` and an `app/` folder;
  - `website.config.json` `examples.externalDeps` + `examples.packages` are the only source (no literal list left in
    server or scripts); this one sits in `repo-contracts.test.ts`;
  - `site.mjs` resolves every output path under the site folder / repo context, and finds the config by walking up from the working
    directory, falls back to mion's.
- Unit tests of the pure helpers: `resolveInRoots` (traversal, absolute path, sibling-prefix root), section resolving
  (own entry → local, other → full link, longest path wins), page width class, layer order check, mount list.
- No marker API involved.

## Docs

- `container/website/AGENTS.md`, `app/AGENTS.md`, `app/components/AGENTS.md`, `server/AGENTS.md`: new paths, the layer
  rules above, split per layer where it reads better. Keep each under the size limit.
- `container/website/CONTAINER.md`: mounts, new inputs, and a new section "Using the Layers from Another Repo":
  what to extend + the shared-last rule, settings to fill, `#layers/…` aliases, every `website.config.json` key, opt-in steps, the one-install rule (new website package → mion `_deps/` + image rebuild), and the Vite
  alias a live demo needs to run a consumer package in the browser.
- Opt-in text: bench data = `"benchData": "<dir>"` holding a `bench-data` tree (from a benchmark run or a release
  asset). The playground is mion.io's only.
- Also: `docs/WEBSITE-DOCGEN.md`, `SETUP.md`, `.agents/skills/card/commands.md`.
- No content page or example changed, so the simplify-docs pass had nothing to run on.

## Fuzzing

None: no parser or codec added. `resolveInRoots` gets table-driven unit tests instead.

## Out of scope

- The pro site itself (pages, deploy, its CI). Lives in mion-pro.
- A CI job that builds a consumer site on every PR. Static contract tests cover the rules here.
- A per-consumer image with extra website packages.
- Making `build-playground.mjs` write outside the mion checkout.
- Any content page rewrite, any visual change beyond the new `Pro` menu entry.

## Done when

- PR open against `main`, CI green.
- `pnpm miondevx website build` + `pnpm miondevx website check --static` + `check --docs` pass for mion.io.
- mion.io output: same route list as the baseline, same look, plus the `Pro` menu entry.
- Outside proof, described in the PR: a throwaway site in a folder outside `container/website/` that
  (a) has its own `website.config.json` and extends the shared layer through `MION_WEBSITE_LAYERS`,
  (b) renders one page using layer components (prose, tiles) and one of its own,
  (c) overrides one layer component with a same-named file,
  (d) shows a `<code-import>` example from its own folder, listed in its own `website.config.json`,
  (e) builds with no mion page and no `_redirects`, names `mion.io` only in the shared section menu and the mion
  footer note, and leaves the mion checkout clean (`git status --porcelain` empty).
- Final report lists: layer paths, aliases, settings a consumer fills, opt-in steps, the config file keys.
- The simplify-comments pass ran on every touched source file, committed on its own.
