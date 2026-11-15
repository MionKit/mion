# Website layers

The site's code is two Nuxt layers. A layer = a folder shaped like a Nuxt app, loaded with `extends`.
mion.io extends both. A site in another repo (through its mion submodule) extends `shared` only.
Read before adding or moving a file under `site-layers/` or a `nuxt.config.ts`.

## Where a file goes

- `shared/` (`mion-shared`): everything both sites use. Docus, the shared look (`app/app.config.ts`, `shell.css`),
  section menu + section list, section themes (`sites/<id>/theme.css`), docs page, layouts, plugins, composables,
  prose components (`TwoslashCode`, `CodeSplit`, `DetailPanel`, …), the example tool (`server/`), benchmark tables +
  charts, code cards, tiles, diagnostics catalog, mion logo (`AppHeaderLogo`, `MionLogo`), footer note
  (`AppFooterNote`), the mion page classes (`mion-pages.css`), generated data (`app/data/`).
- `mion-io/` (`mion-io`): mion.io ONLY, listed first. `app/app.config.ts` (github, seo, socials, footer, `shell.*`),
  `app/pages/runtypes/playground.vue`, the RunTypes playground (components, engine, `scripts/build-playground.mjs`).
  Never extended by another site: it carries mion.io's identity and aliases `@mionjs/run-types` for the whole build.
- `container/website/` itself has no `app/`: `nuxt.config.ts` (`extends`, `site`, prerender routes), `content/`,
  `public/`.
- Used by both sites → shared. mion.io page, setting or playground piece → mion-io.

## Rules

- ⚠️ No `~/`, `@/`, `~~/` inside a layer: Nuxt resolves them against the CONSUMING site. Use a relative path, or
  from another layer or a site `#layers/mion-shared/…` (the layer ROOT: `#layers/mion-shared/app/utils/benchFormat`).
  A layer's `css` entry for its own file is an absolute path built from `import.meta.url`.
- ⚠️ Never in `shared`: `site.*`, `nitro.prerender`, an address, `content/`, `_redirects`, banners, `bench-data/`,
  a routed page (the docs catch-all is the one page). Nuxt merges all of that into every consumer.
- ⚠️ `shared` is LAST in `extends`: `['./site-layers/mion-io', './site-layers/shared']`.
  A layer's own layers land right after it, so `shared` last keeps Docus lowest. Elsewhere Docus outranks the layers
  after it and its components win silently. The `shared` module throws at startup when Docus is not last.
- A local layer path starts with `./` or is absolute: a bare `site-layers/shared` is read as an npm name.
- Folder name is `site-layers`, never `layers`: Nuxt auto-extends every `<site>/layers/*`.
- Every layer keeps an `app/` folder: Nuxt UI scans each layer's `app/` for class names.
- Vite aliases only in `mion-io`.
- Same-named file in a higher layer or the site replaces the lower one (how `shared`'s `AppHeaderLogo` replaces Docus').
- A layer's `public/` is served by every consumer; the site's own file wins.
- `shared/content.config.ts` sets `cwd` to the consuming site's `content/`: without it a layer reads its own folder.
- Pinned by `packages/devtools/test/website-layer-contracts.test.ts`.

## Settings a site fills

- `nuxt.config.ts`: `extends`, `site: {name, url}`, own prerender routes, own `css`.
- `app/app.config.ts`: `github`, `seo`, `docus.{title,description,image,socials,github,footer}`, and `shell`:
  - `sections`: extra menu entries only this site shows (a `SubsiteEntry`).
  - `widePages` / `flushPages`: regex sources on the route path. Wide = no prose width cap, no TOC rail.
    Flush = rail kept. A local section's home page is wide without being listed.
  - `menuLabel`: the section menu button's aria text.
  - `origin`: the site's address. Leave it out: `shared` fills it from `site.url`.
- Logo + footer note: a same-named `AppHeaderLogo.vue` / `AppFooterNote.vue` replaces mion's.
- Colours: add `sites/<id>/theme.css` to the site's own `css`. Same `data-site` as a shared theme = override.

## Section list

- `shared/app/utils/subsites.ts` `SUBSITES`: the ONE list both sites show, with FULL links (`https://mion.io/rpc`,
  `https://pro.mion.io`). An entry under the site's own address becomes a local link, the rest stay full links.
- The route's section = the local entry with the longest matching path. A site whose entry is its root (`pro`) owns
  the whole navigation tree.
- A theme for another site's entry lives in `shared` too: this site paints that menu entry.

## Another repo's site

- One `website.config.json` at ITS repo root; the scripts find it by walking up from the working directory.
  Keys + mounts: [CONTAINER.md](../CONTAINER.md#using-the-layers-from-another-repo).
- It installs no website package. Its files are mounted into the one image built from `_deps/`.
  New website dependency → mion's `_deps/` + image rebuild.
- Its `nuxt.config.ts` extends `${process.env.MION_WEBSITE_LAYERS}/shared`, last in the list.
