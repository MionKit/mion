---
type: feature
spec: full-plan
status: ready
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
container/website/                 mion.io site (content/, public/, .output keep their paths)
├── nuxt.config.ts                 extends parts + playground + shell; name, url, prerender routes
├── examples.config.json           NEW: mion's example tool values
├── app/app.config.ts              mion identity only
├── app/pages/runtypes/playground.vue
├── content/  public/  _deps/  Containerfile  parked/  tests/  scripts/
└── site-layers/
    ├── shell/        generic docs site + example tool      $meta.name 'mion-shell'
    ├── parts/        mion things another site may load     $meta.name 'mion-parts'
    └── playground/   opt-in                                $meta.name 'mion-playground'
```

- Folder is `site-layers`, never `layers`: Nuxt auto-extends every `<rootDir>/layers/*`.
- Every layer has an `app/` folder (Nuxt UI adds a Tailwind `@source` per layer `app/`; without one the scan misses it).

### What goes where

- **shell**: `extends: ['docus']` in its `nuxt.config.ts`. `content.config.ts`. `app/app.config.ts` (the shared look:
  `ui.prose.*`, `ui.colors.primary`, `navigation.sub`, docus `aside` / `main` / `header`). `app/assets/css/shell.css`
  (generic part of `mion.css`: lines 1-163, 250-275, 668-782, 1042-1048, 1091-1095) + `sites/<id>/theme.css` for
  `rpc`, `runtypes`, `benchmarks`, `pro`. Components `SubsiteMenu`, `app/AppHeaderBody`, `app/AppHeaderCenter`,
  `app/AppFooterRight`, `docs/DocsAsideLeft*`, `content/{TwoslashCode,CodeSplit,DetailPanel,HoverList,Spacer,
  StylishList,SlidedTitle}`, `global/mermaid`. All four composables. `layouts/fullscreen.vue`.
  `pages/[[lang]]/[...slug].vue`. Both plugins. `utils/subsites.ts`. All of `server/` except `function-catalog.ts`.
  `public/fonts/` minus `code-card/`.
- **parts**: `BenchBar`, `BenchColumnInfo`, `BenchTable`, `HomeBenchTable`, `RuntypesBenchBars`, `ServerBenchBars`,
  `CodeCard`, `ClientSize`, `StatTiles`, `HomeTestTiles`, `HomeRuntypesTiles`, `PlatformTiles`, `Diagnostic*`,
  `MionLogo`, `MionType`, `RealWorldScenario`, `TypeSafeAnimation`, `VerticalIntegration`, `go-generated/`.
  `app/components/app/AppHeaderLogo.vue` (moved out of `components/content/`) and a new `AppFooterNote.vue` holding the
  lineage paragraph. `app/data/`. `app/utils/{benchAggregate,benchFormat,serverBenchRows,codeCardPlayer,
  replacedLibraries}`. `app/assets/css/{mion-pages.css,code-card.css}` (`mion-pages.css` = the mion page classes:
  lines 164-249, 276-667, 783-1041, 1049-1090). `server/utils/function-catalog.ts`. `public/{platform-logos,
  type-safe-apis.gif,fonts/code-card}`.
- **playground**: `content/RuntypesPlayground.vue`, `components/playground/*`, `app/playground/*` (with `.vendor/`),
  the three `@mionjs/run-types` Vite aliases, `optimizeDeps.exclude: ['monaco-editor']`, generated
  `public/playground-app/`.
- **mion site**: `site: {name, url}`, `nitro.prerender.routes`, `nitro.output`, `app.buildAssetsDir`, `colorMode`,
  mion `app.config.ts` keys (github, seo, docus title / socials / github / footer), the playground page, `content/`,
  `public/{_redirects,banners,favicon*,bench-data}`.
- Delete unused `public/mountains.webp` and `public/fonts/MonomaniacOne-Regular.ttf` if a fresh grep confirms no use.

### Layer rules (each one checked against upstream source)

- ⚠️ Shell goes LAST in `extends`: `extends: [parts, playground, shell]`. c12 puts a layer's own nested layers right
  after it, so shell last keeps Docus last. Otherwise Docus outranks parts and its `AppHeaderLogo` wins silently.
  Shell module throws at startup if Docus is not the last layer.
- Local layers are written `./site-layers/shell` or absolute. A bare `site-layers/shell` is read as an npm name.
- No `~/` or `@/` inside a layer. Cross-file imports use relative paths or the built-in alias
  `#layers/mion-shell/...`, `#layers/mion-parts/...`, `#layers/mion-playground/...` (points at the layer ROOT, so
  `#layers/mion-parts/app/utils/benchFormat`). Works in Vite, Nitro, CSS `@import` and the generated tsconfig.
  Layer `css` entries are built from `import.meta.url`.
- `content.config.ts` in shell sets `cwd` from `useNuxt().options.rootDir + '/content'` (import from `nuxt/kit`),
  same split as today (`**/index.md` = landing). Collections merge by name, last wins: shell replaces Docus, and a
  consumer with no `content.config.ts` gets only its own `content/`.
- Never in a layer: `site.*`, `nitro.prerender.routes`, a routed page other than the docs catch-all, `_redirects`,
  banners, `bench-data/`. Arrays concatenate across layers and object keys fill in as defaults, so they would leak.
- Vite aliases + Monaco exclude only in the playground layer.
- Shell + parts each register one inline module (`modules: [(_, nuxt) => {…}]`): runs once, `nuxt.options.rootDir` =
  the consuming site. Shell's reads `examples.config.json`, sets `runtimeConfig.exampleTool`, registers
  `content:file:beforeParse` (markdown-import, code-import) and the dev watcher plugin. Parts' registers the
  function-catalog hook.

### Settings a site fills in

- `nuxt.config.ts`: `site: {name, url}`, `extends`, own `css`, own prerender routes.
- `app/app.config.ts`: `github`, `seo`, `docus.{title,description,image,socials,github,footer}` as today, plus a new
  `shell` key: `origin` (the site's own address, used to localise menu links), `sections` (extra menu entries only this
  site shows), `widePages` + `flushPages` (regex sources; replace the hard-coded tests in `site-attr.ts`),
  `menuLabel` (the aria text).
- Logo and footer note: override `AppHeaderLogo.vue` / `AppFooterNote.vue` with a same-named file. Shell-only site
  gets Docus' default wordmark and no note.
- Colours: a site adds `sites/<id>/theme.css` to its own `css`. Same `data-site` name as a shared one = override.

### Section list

- `shell/app/utils/subsites.ts`: `SUBSITES` holds full links: `https://mion.io/rpc`, `/runtypes`, `/benchmarks`,
  and `https://pro.mion.io` (`id: 'pro'`, label `Pro`, text "Paid extensions to mion.", icon `i-lucide-gem`, violet
  ramp built by the ramp rule in `app/AGENTS.md`). `id` becomes `string`.
- `useSubsite()` returns the list with each entry resolved: link starts with `shell.origin` → local path, else
  external link (`target="_blank"` not set, same tab). Site `sections` are appended.
- `subsiteForPath` picks the longest matching local path (pro's own entry is `/`).
- mion.io menu shows four entries. Pro's theme lives in shell because mion.io paints that entry.

### Example tool

`<site>/examples.config.json`, read by the shell module (build + server) and by `scripts/website/site.mjs` (mounts).
Removes the "change both ends" pair.

```json
{
  "packages": [{"dir": "packages/run-types", "name": "@mionjs/run-types"}],
  "exampleDirs": ["packages/private-examples/src"],
  "readRoots": ["packages"],
  "externalDeps": ["drizzle-orm"],
  "importableDocs": {"json-schema-2020-12-javascript": "docs/json-schema-2020-12-javascript.md"},
  "contentDir": "content"
}
```

- `packages`: folder → published name, mounted in the twoslash virtual file system (moves out of `twoslash.post.ts`).
- `exampleDirs`: what `/api/read-file` + `/api/twoslash` may serve, what the dev watcher watches, the files loaded for
  relative imports. Replaces every `private-examples` literal.
- `readRoots`: what `<code-import>` may read (`resolveInPackages` → `resolveInRoots`). Same traversal wall.
- `externalDeps`: read from `<repo>/node_modules/<name>`. A consumer lists the `@mionjs/*` it imports here.
  Apply the `.ts` import-suffix rewrite to these too.
- `importableDocs`, `contentDir` (the folder the watcher stamps, always the consuming site's).
- All paths relative to the repo root (`MION_REPO_ROOT`), except `contentDir` (relative to the site).
- mion's file holds exactly today's values. Missing file = empty tool, no error.
- `scripts/check-links.mts` + `scripts/check-code-imports.mjs` keep working for mion (paths unchanged).

### Site scripts

- `scripts/website/site.mjs`: inputs are env vars only, no flags. ONE var is enough for another repo; the rest derive.

  | Env | Default |
  |---|---|
  | `MION_WEBSITE_SITE` | `<mion>/container/website`. A relative value resolves from the working directory. |
  | `MION_WEBSITE_REPO_CONTEXT` (exists) | the git root of the site folder |
  | `MION_WEBSITE_CONTAINER` (exists) | `tsrt-website` for mion's site, else `<repo folder name>-website` |
  | `MION_WEBSITE_LAYERS_DIR` | `<mion>/container/website/site-layers` (mion = the checkout the script lives in) |
  | `MION_WEBSITE_BENCH_DATA` | none |

- Another repo runs `MION_WEBSITE_SITE=website node third_party/mion/scripts/website/site.mjs generate`, usually
  from a `package.json` script. `loadEnv` keeps reading mion's `.env` only; a consumer sets vars in its own script.
- "Is this mion's own site" = the resolved site folder equals `<mion>/container/website`. Never a separate switch.

- Mounts: site dirs + config files (add `examples.config.json`) at `/app`; layers at `/app/site-layers` (read-only
  when the site is not mion's); each `readRoots` entry, each importable doc, each `externalDeps` dir under
  `/repo-context`; the `MION_WEBSITE_BENCH_DATA` folder at `/bench-data` read-only.
- Container env: `MION_WEBSITE_LAYERS=/app/site-layers`, `MION_WEBSITE_BENCH_DATA=/bench-data` when set. Parts' module
  adds `nitro.publicAssets {dir, baseURL: '/bench-data'}` when the env is set. Register new vars in
  `.agents/docs/env-vars.md` + the env registry.
- `.docdata`, `.output`, `.output-staging` resolve under the repo context / site folder, never the mion checkout.
- `ensureMionDists` + `ensurePlayground` run only for mion's own site. `homeTwoslashPaths` + `cmdVerifyDocs` read
  `exampleDirs` instead of the `private-examples` literal.
- Drop every `--extends docus` (also `_deps/package.json` scripts).
- `build.mjs`, `serve.mjs`, `check-static.mjs`: take the site dir from the same input. Read `check-static.mjs` first:
  generic checks (hollow page, missing picture) run for any site, benchmark page checks only when the site has them.
- Generated outputs that move, all git-ignored where they were: `container/website/.gitignore`,
  `.containerignore` (add `site-layers/`), `scripts/core/clean.mjs:50-51`.

### Path updates (pattern: old `container/website/{app,server,sites,public}/…` → its layer path)

- Writers: `scripts/website/gen-client-size.mjs:16`, `gen-test-counts.mjs:27`, `build.mjs:104-116`,
  `container/website/scripts/build-playground.mjs:35,38`, `scripts/core/gen-diagnostics-catalog.mjs:14`,
  `scripts/miondevx.mjs:163-164`, `scripts/lib/card-manifest.mjs:7`, `tools/code-card/src/export.ts:14-16`,
  `tools/code-card/src/render.ts:11`, `app/data/cards/manifest.json` (regenerate with the card tool).
- Readers: `scripts/website/bench-data/pr-report.mjs:8`, `scripts/core/test-skip.mjs:55`,
  `packages/run-types/test/playground/*` (7 files), `packages/devtools/test/{bench-aggregate,mion-bench-wire,
  bench-fairness}.test.ts`, `tools/code-card/test/export.test.ts:48`.
- CI: no path change needed. `scripts/ci/lanes.mjs:53` is prefix-based; confirm `ci-lane-contracts.test.ts:186-250,1141`
  sample paths and update them.

### Build order (each step ends on a check)

1. Baseline: generate the current site, save the sorted route list + HTML with hashed asset names normalised.
2. Empty shell (`$meta`, `extends: ['docus']`, empty `app/`), mount, drop `--extends docus`. Check: generate matches
   baseline, header shows the mion logo, and inside the container `chokidar` + `nuxt/kit` resolve from
   `/app/site-layers/shell`. RISKIEST step: `_deps/pnpm-workspace.yaml` may hide non-direct deps from a layer folder.
   If `chokidar` does not resolve, add it to `_deps/package.json` (image rebuild).
3. `content.config.ts` to shell. Check: same routes.
4. CSS split. Check: `tests/theme.spec.ts`, computed `--ui-primary` equal on `/`, `/rpc`, `/runtypes`, `/benchmarks`.
5. Shell chrome + settings + section list. Check: HTML diff empty apart from the pro menu entry.
6. Server + `examples.config.json`. Check: `pnpm miondevx website check --docs`; editing an example reloads its page.
7. Parts. Check: Docus is the last layer, HTML diff empty.
8. Playground. Check: `/runtypes/playground` loads.
9. Scripts inputs + path updates + tests. Check: `pnpm run lint`, devtools tests, card export.
10. Outside proof (see Done when).

## Tests

- `packages/devtools/test/website-theme-contracts.test.ts`: repoint to the layer paths; walk all three layers for the
  colour rules. Subsite list: mion's three ids still match `content/NN.<id>/` + a theme each; `pro` has a theme and no
  content dir. Docus pin on the `[...slug].vue` copy stays.
- `website-links.test.ts`: a link may resolve to a file in any layer `public/`; CSS `@import` glob covers
  `site-layers/**`.
- `repo-contracts.test.ts`: package list guard reads `examples.config.json` (`:787`); bench components must import
  from `#layers/mion-parts/app/utils/...` (`:1714-1740`); CodeCard, counts, client size, playground asset guards
  follow the files.
- New contract tests (static, no container):
  - no `~/`, `@/`, `~~/` import or `css` entry inside `site-layers/**`;
  - no layer `nuxt.config.ts` sets `site`, `nitro.prerender` or a routed page; only playground sets `vite.resolve.alias`;
  - mion's `extends` ends with shell; every layer has `$meta.name` and an `app/` folder;
  - `examples.config.json` `externalDeps` + `packages` are the only source (no literal list left in server or scripts);
  - `site.mjs` resolves every output path under the site folder / repo context, and derives repo context + container name
    from `MION_WEBSITE_SITE` alone.
- Unit test the pure helpers: `resolveInRoots` (traversal, absolute path, sibling-prefix root), section resolving
  (own entry → local, other → full link, longest path wins).
- No marker API involved.

## Docs

- `container/website/AGENTS.md`, `app/AGENTS.md`, `app/components/AGENTS.md`, `server/AGENTS.md`: new paths, the layer
  rules above, split per layer where it reads better. Keep each under the size limit.
- `container/website/CONTAINER.md`: mounts, new inputs, and a new section "Using the Layers from Another Repo":
  what to extend + the shell-last rule, settings to fill, `#layers/…` aliases, `examples.config.json`, opt-in steps,
  exact site-script inputs, the one-install rule (new website package → mion `_deps/` + image rebuild), and the Vite
  alias a live demo needs to run a consumer package in the browser.
- Opt-in text: playground = add the layer + run `container/website/scripts/build-playground.mjs` (needs Go + a
  bootstrapped mion checkout; writes git-ignored files inside the layer). Bench data = `MION_WEBSITE_BENCH_DATA=<dir>` holding a
  `bench-data` tree (from a benchmark run or a release asset).
- Also: `docs/WEBSITE-DOCGEN.md`, `SETUP.md:211-221`, `.agents/docs/env-vars.md`, `.agents/skills/card/commands.md`,
  `tools/code-card/README.md`, `container/benchmarks/README.md:377`, `go-generated/README.md`, `scripts/AGENTS.md` if
  it lists website commands.
- No content page changes.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

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
  (a) extends the layers through `MION_WEBSITE_LAYERS`,
  (b) renders one page using a shell component, a parts component and one of its own,
  (c) overrides one layer component with a same-named file,
  (d) shows a `<code-import>` example from its own folder, listed in its own `examples.config.json`,
  (e) builds with no mion page, no `_redirects` and no `mion.io` address in its output, and leaves the mion checkout
  clean (`git status --porcelain` empty).
- Final report lists: layer paths, aliases, settings a consumer fills, opt-in steps, exact site-script inputs.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each
  committed on its own.
