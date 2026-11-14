# Website layers

The site's code is three Nuxt layers. A layer = a folder shaped like a Nuxt app that another app loads with `extends`.
mion.io extends all three. A site in another repo (through its mion submodule) extends them too and adds its own files.
Read before adding or moving a file under `app/`, `site-layers/` or a `nuxt.config.ts`.

## Where a file goes

- `shell/` (`mion-shell`): the generic docs site. Docus, the shared look (`app/app.config.ts`, `shell.css`), section
  menu + section list, section themes (`sites/<id>/theme.css`), docs page, layouts, plugins, composables, prose
  components (`TwoslashCode`, `CodeSplit`, `DetailPanel`, …), the example tool (`server/`).
- `parts/` (`mion-parts`): mion things another site may show. Benchmark tables + charts, code cards, tiles,
  diagnostics catalog, mion logo (`AppHeaderLogo`, `MionLogo`), footer note (`AppFooterNote`), the mion page classes
  (`mion-pages.css`), generated data (`app/data/`), function-catalog hook.
- `playground/` (`mion-playground`): the RunTypes playground component + its engine. Opt-in: it aliases
  `@mionjs/run-types` for the whole build and needs `scripts/build-playground.mjs` output.
- `container/website/` itself: mion.io's identity ONLY. `nuxt.config.ts` (`site`, prerender routes), `app/app.config.ts`
  (github, seo, socials, footer, `shell.*`), `app/pages/runtypes/playground.vue`, `content/`, `public/`.
- New generic thing → shell. New mion-flavoured component or data → parts. New mion.io page or setting → the site.

## Rules

- ⚠️ No `~/`, `@/`, `~~/` inside a layer: Nuxt resolves them against the CONSUMING site. Use a relative path, or
  across layers `#layers/mion-<layer>/…` (points at the layer ROOT: `#layers/mion-shell/app/composables/useInView`).
  A layer's `css` entry is an absolute path built from `import.meta.url`.
- ⚠️ Never in a layer: `site.*`, `nitro.prerender`, an address, `content/`, `_redirects`, banners, `bench-data/`,
  a routed page (the docs catch-all in shell is the one page). Nuxt merges all of that into every consumer.
- ⚠️ Shell is LAST in `extends`: `['./site-layers/parts', './site-layers/playground', './site-layers/shell']`.
  A layer's own layers land right after it, so shell last keeps Docus lowest. Elsewhere Docus outranks the layers
  after it and its components win silently. The shell module throws at startup when Docus is not last.
- A local layer path starts with `./` or is absolute: a bare `site-layers/shell` is read as an npm name.
- Folder name is `site-layers`, never `layers`: Nuxt auto-extends every `<site>/layers/*`.
- Every layer keeps an `app/` folder: Nuxt UI scans each layer's `app/` for class names.
- Vite aliases only in the playground layer.
- Same-named file in a higher layer or the site replaces the lower one (how parts' `AppHeaderLogo` replaces Docus').
- A layer's `public/` is served by every consumer; the site's own file wins.
- `shell/content.config.ts` sets `cwd` to the consuming site's `content/`: without it a layer reads its own folder.
- Pinned by `packages/devtools/test/website-layer-contracts.test.ts`.

## Settings a site fills

- `nuxt.config.ts`: `extends`, `site: {name, url}`, own prerender routes, own `css`.
- `app/app.config.ts`: `github`, `seo`, `docus.{title,description,image,socials,github,footer}`, and `shell`:
  - `sections`: extra menu entries only this site shows (same shape as `SUBSITES`).
  - `widePages` / `flushPages`: regex sources on the route path. Wide = no prose width cap, no TOC rail.
    Flush = rail kept.
  - `menuLabel`: the section menu button's aria text.
  - `origin`: the site's address. Leave it out: the shell fills it from `site.url`.
- Logo + footer note: a same-named `AppHeaderLogo.vue` / `AppFooterNote.vue`. Shell alone = Docus' wordmark, no note.
- Colours: add `sites/<id>/theme.css` to the site's own `css`. Same `data-site` as a shared theme = override.

## Section list

- `shell/app/utils/subsites.ts` `SUBSITES`: the ONE list both sites show, with FULL links (`https://mion.io/rpc`,
  `https://pro.mion.io`). An entry under the site's own address becomes a local link, the rest stay full links.
- The route's section = the local entry with the longest matching path. A site whose entry is its root (`pro`) owns
  the whole navigation tree.
- A theme for another site's entry lives in shell too: this site paints that menu entry.

## Another repo's site

- One `website.config.json` at ITS repo root; the scripts find it by walking up from the working directory.
  Keys + mounts: [CONTAINER.md](../CONTAINER.md#using-the-layers-from-another-repo).
- It installs no website package. Its files are mounted into the one image built from `_deps/`.
  New website dependency → mion's `_deps/` + image rebuild.
- Its `nuxt.config.ts` extends `${process.env.MION_WEBSITE_LAYERS}/parts` (+ `/playground`) + `/shell`.
