# Website app: subsites, styling

How the Nuxt app wires the three subsites and how colour works.

- Components: [components/AGENTS.md](components/AGENTS.md). Read before adding or editing a component.

## Subsites

- `app/utils/subsites.ts` = single source of truth (`SUBSITES`: id, label, title, path, icon, description).
  `useSubsite()` derives the current one from the route.
- Words exactly `RPC`, `RunTypes`, `Benchmarks` everywhere. Every link to a subsite goes to its `home`.
- Each subsite: OWN sidebar (its sections only), own colour scheme, a home page.
- Home = first page of its introduction section (`About mion RPC`, `About mion RunTypes`, `mion Benchmarks`).
  A DOCS page: docs layout + sidebar, minus page header and TOC (the hero is its header).
- `/<id>` redirects to home: app router (`app/pages/<id>/index.vue`, `definePageMeta({redirect})`) + static host
  (`public/_redirects`).
- `app/plugins/site-attr.ts`: `data-site="<id>"` on `<html>` (colour scheme keys on it) + the per-section body class.
- `app/app.config.ts` `navigation.sub: 'aside'`: the one Docus key scoping the sidebar to the current top-level
  section instead of the whole tree.
- `DocsAsideLeftTop.vue` overridden to nothing: the header's subsite menu replaces Docus' section anchors.
- `AppHeaderBody.vue` (mobile menu): subsite list + current subsite's sections only.
- `content.config.ts` redefines Docus' `docs` + `landing`: ANY `<dir>/index.md` = landing, never docs. Only root
  `content/index.md` has one (in a subsite dir it would shadow the redirect).
- Keep the names `docs` + `landing`: Docus' own pages, search and sitemap query them literally.
- `app/pages/[[lang]]/[...slug].vue` overrides Docus' docs page (a copy, pinned to the docus version by
  `website-theme-contracts.test.ts`): prev/next never crosses a subsite, docs titles end with the subsite's `title`.
  Landing pages use their own `seo.title` as-is.
- Header: mion logo (`MionLogo.vue`, the one logo, in `AppHeaderLogo.vue`; fixed colour `--mion-logo-accent`)
  + subsite menu (`SubsiteMenu.vue`, rendered by `AppHeaderCenter.vue`).
- Subsite menu: one button naming the current subsite in its accent (`Explore` on root), opens a popup of all
  three, each with icon + one-line intro.
- Root `/` landing (`content/index.md`): one `.home-subsite` card per subsite, carrying its `data-site`.
  Card: centered title, intro, buttons; beside them a code example or the live bench summary (`HomeBenchTable.vue`).
  rpc card: server + client examples side by side under the intro.
- Shared by all subsites: components, layouts, server utils, playground (`/runtypes/playground`), `public/` (fonts,
  favicon, banners, `_redirects`, generated `bench-data/` + `playground-app/`).
- `app/app.config.ts`: Docus theme, SEO, `navigation.sub`, `primary` alias, socials. Nuxt merges app configs with
  `defu` (project first, per key): Docus defaults still apply under anything left out.
- Favicon: `public/favicon.ico` + `favicon_io/`, one for the whole site.

## Styling

- `app/assets/css/mion.css` holds the site's ONE `@theme static` block: the `brand` Tailwind palette, every shade a
  reference (`--color-brand-N: var(--site-brand-N)`), never a hex. Then it imports the three `sites/<id>/theme.css`.
- Palette + theme imports stay in `mion.css`, never a second `nuxt.config.ts` `css` entry (Tailwind v4 compiles ONE
  root; a `@theme` feeds utilities only inside its import graph).
- `static` is load-bearing: Nuxt UI references the shades only through runtime `var()` strings.
- ⚠️ Colour scheme lives in `sites/<id>/theme.css` ONLY. Under `[data-site='<id>']` it fills 11 `--site-brand-N`
  shades + 6 tokens:
  - `--site-accent`: hero, playground, header word.
  - `--site-gradient-from` / `-to` / `-mix`: animated section-title gradient, composed once in `mion.css` as
    `--site-title-gradient`.
  - `--site-hue`: decorative `hsl()` gradients. `--site-hue-good`: "best" end of bad→good rank ramps, green on
    every subsite so heatmaps still read.
- A `[data-site='<id>'].light, .light [data-site='<id>']` block may override single-valued tokens per mode.
- `app.config.ts` `ui.colors.primary: 'brand'` → `--ui-primary` + `--color-primary-*` follow the subsite.
  Nuxt UI flips `--ui-primary` itself: shade 500 light, 400 dark.
- Root landing: each intro block carries its own `data-site`. The `[data-site]` bridge in `mion.css` re-derives
  brand + Nuxt UI vars on that element (the `:root` ones Tailwind declares already resolved there).
- Shared `app/` tree carries NO site colour. Use `var(--ui-primary)`, `var(--color-brand-N)`, `var(--site-accent)`,
  `color-mix(in srgb, var(--color-brand-500) N%, transparent)` (washes), `hsl(var(--site-hue) …)` (hues).
- Banned in `app/`: hex, `rgba(138, 168, 94, …)`, hue constants, `var(--x, #fallback)` (a fallback = hidden site
  colour). `packages/devtools/test/website-theme-contracts.test.ts` fails on these + on a theme.css missing a token.
- New ramp: keep the mion palette's OKLCH lightness + chroma per shade, change only hue (equal light/dark contrast).
  Take the rpc ramp's `oklch(L C H)` per shade, swap the hue, convert to sRGB hex (lower C if out of gamut).
  `--site-accent` = accent row at the new hue; `--site-gradient-from` / `-to` = new 500 / 300;
  `--site-gradient-mix` = partner colour ~120 degrees away; `--site-hue` = HSL hue of the new 500.
- Root landing cards: `.home-subsite` / `.home-subsite-card` / `.home-intro` / `.home-split` in `mion.css`.
- Parallax is CSS only (scroll-driven, `animation-timeline: view()`): card rises in, soft halo drifts against scroll.
  Off under `prefers-reduced-motion` or without browser support.
- Every page template wraps content in a `.site-page` with `data-site`: a page paints in its subsite colours from its
  own markup (no script-set class).
- Mermaid reads `--site-accent` at mount. A diagram's `style X color:var(--site-accent)` lines get the computed value
  substituted before render (mermaid wants literal colours).
- Home page titles: every section `h2` (UPageSection title slot, prose `## …` in `.home-features`) runs the animated
  `--site-title-gradient`. Card `h3` titles: plain `--ui-text-highlighted`.
- Only a title that is a real link (or a whole-card `::card{to}` link's title) gets a primary-coloured underline.
- Dark mode default, light supported via `:root.dark` / `:root.light`.
