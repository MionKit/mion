# Website shell app: subsites, styling

How the shell layer wires the subsites and how colour works. Paths are relative to `site-layers/shell/` unless they
name another layer or the site. Which layer a file goes in: [site-layers/AGENTS.md](../../AGENTS.md).

- Components: [components](../../parts/app/components/AGENTS.md). Read before adding or editing a component.

## Subsites

- `app/utils/subsites.ts` = single source of truth (`SUBSITES`: id, label, title, url, homeTitle, icon, description).
  `useSubsite()` resolves each `url` against the site's address (`path`: local `/<id>` or the full link) and derives
  the current one from the route. `pro` is the other site: a menu entry + theme here, no page.
- Words exactly `RPC`, `RunTypes`, `Benchmarks` everywhere. Every link to a subsite goes to its `path`.
- Each subsite: OWN sidebar (its sections only), own colour scheme, a home page.
- Home = first page of its introduction section (`About mion RPC`, `About mion RunTypes`, `mion Benchmarks`).
  A DOCS page: docs layout + sidebar, minus page header and TOC (the hero is its header).
- Home is served AT `/<id>` (frontmatter `path: /<id>` + `navigation: false`; no `app/pages/<id>/index.vue`).
  `subsiteSidebar()` puts it back first in the Introduction sidebar (desktop `DocsAsideLeftBody`, mobile
  `AppHeaderBody`); its old long URL 301s to `/<id>` in the site's `public/_redirects`.
- `app/plugins/site-attr.ts`: `data-site="<id>"` on `<html>` (colour scheme keys on it) + the per-section body class,
  from the site's `shell.widePages` / `shell.flushPages`.
- `app/app.config.ts` `navigation.sub: 'aside'`: the one Docus key scoping the sidebar to the current top-level
  section instead of the whole tree.
- `DocsAsideLeftTop.vue` overridden to nothing: the header's subsite menu replaces Docus' section anchors.
- `AppHeaderBody.vue` (mobile menu): subsite list + current subsite's sections only.
- `content.config.ts` redefines Docus' `docs` + `landing`: ANY `<dir>/index.md` = landing, never docs. Only root
  `content/index.md` has one (in a subsite dir it would shadow the redirect).
- Keep the names `docs` + `landing`: Docus' own pages, search and sitemap query them literally.
- `app/pages/[[lang]]/[...slug].vue` overrides Docus' docs page (a copy, pinned to the docus version by
  `website-theme-contracts.test.ts`): prev/next never crosses a subsite, docs titles end with the subsite's `title`
  (the site name outside every section). Landing pages use their own `seo.title` as-is.
- Header: mion logo (parts layer: `MionLogo.vue`, the one logo, in `app/AppHeaderLogo.vue`; fixed colour
  `--mion-logo-accent`) + subsite menu (`SubsiteMenu.vue`, rendered by `AppHeaderCenter.vue`).
- Footer: `AppFooterRight.vue` renders `<AppFooterNote />`. Empty here; the parts layer's holds the lineage line.
- Subsite menu: one button naming the current subsite in its accent (`Explore` on root), opens a popup of every
  entry, each with icon + one-line intro.
- Root `/` landing (`content/index.md`): one `.home-subsite` block per subsite, carrying its `data-site`.
  Block: title, intro, buttons; beside them a code example or the live bench summary (`HomeBenchTable.vue`).
  rpc block: server + client examples side by side under the intro.
- Shared by all subsites: components, layouts, server utils, playground (`/runtypes/playground`), the site's
  `public/` (favicon, banners, `_redirects`, generated `bench-data/`).
- `app/app.config.ts`: the shared look (`ui.prose`, `primary` alias, `navigation.sub`, Docus aside / header).
  The site's own holds SEO, socials, footer. Nuxt merges app configs with `defu` (site first, per key): layer and
  Docus defaults still apply under anything left out.
- Favicon: the site's `public/favicon.ico` + `favicon_io/`, one for the whole site.

## Styling

- `app/assets/css/shell.css` holds the site's ONE `@theme static` block: the `brand` Tailwind palette, every shade a
  reference (`--color-brand-N: var(--site-brand-N)`), never a hex. Then it imports every `sites/<id>/theme.css`.
- Palette + shared theme imports stay in `shell.css` (Tailwind v4 compiles ONE root; a `@theme` feeds utilities
  only inside its import graph). A site's extra theme only sets `--site-*` values, so it may be its own `css` entry.
- mion page classes (home blocks, tiles, badges) live in the parts layer's `mion-pages.css`. Its `@reference` line
  runs it through Tailwind too, so its `color-mix()` rules keep their plain-colour fallbacks.
- `static` is load-bearing: Nuxt UI references the shades only through runtime `var()` strings.
- ⚠️ Colour scheme lives in `sites/<id>/theme.css` ONLY. Under `[data-site='<id>']` it fills 11 `--site-brand-N`
  shades + 6 tokens:
  - `--site-accent`: hero, playground, header word.
  - `--site-gradient-from` / `-to` / `-mix`: pastel tones of the animated section-title gradient, composed once in
    `shell.css` as `--site-title-gradient`. Light block: deeper tones of the same hues (pastel vanishes on light).
  - `--site-hue`: decorative `hsl()` gradients, pastel via `--mion-pastel-s` / `-l` (shell.css, per mode).
    `--site-hue-good`: "best" end of bad→good rank ramps, green on every subsite so heatmaps still read.
- A `[data-site='<id>'].light, .light [data-site='<id>']` block may override single-valued tokens per mode.
- `app.config.ts` `ui.colors.primary: 'brand'` → `--ui-primary` + `--color-primary-*` follow the subsite.
  Nuxt UI flips `--ui-primary` itself: shade 500 light, 400 dark.
- Root landing: each intro block carries its own `data-site`. The `[data-site]` bridge in `shell.css` re-derives
  brand + Nuxt UI vars on that element (the `:root` ones Tailwind declares already resolved there).
- A layer's `app/` tree carries NO site colour. Use `var(--ui-primary)`, `var(--color-brand-N)`, `var(--site-accent)`,
  `color-mix(in srgb, var(--color-brand-500) N%, transparent)` (washes), `hsl(var(--site-hue) …)` (hues).
- Raw colour in `app/` (hex, literal `rgb()` / `hsl()`, named) ONLY as a custom property in a `shell.css` `:root`,
  `:root.dark` or `:root.light` block, never `var(--x, #fallback)`. Enforced by `website-theme-contracts.test.ts`.
- New ramp: keep the mion palette's OKLCH lightness + chroma per shade, change only hue (equal light/dark contrast).
  Take the rpc ramp's `oklch(L C H)` per shade, swap the hue, convert to sRGB hex (lower C if out of gamut).
  `--site-accent` = accent row at the new hue; `--site-gradient-from` / `-to` = pastel tints near new 300 / 100;
  `--site-gradient-mix` = pastel partner ~120 degrees away; `--site-hue` = HSL hue of the new 500.
- Root landing blocks: `.home-subsite` / `.home-subsite-block` / `.home-intro` / `.home-split` in `mion-pages.css`.
- Home pages: text sits on the plain page background, no card chrome. Small tiles (stat, test, platform) and code stay.
- Corners: one `--ui-radius` in `shell.css` (buttons, code, tabs). Inline code look: `ui.prose.code` in `app.config.ts`.
- Code blocks + benchmark cards: ONE panel look, `--mion-panel-bg` + `var(--ui-border)` + `--mion-panel-radius`.
  Code label = plain text, no tab: `ui.prose.pre` / `codeGroup` in `app.config.ts`; `TwoslashCode.vue` reads that `pre`.
  Label strip: `--mion-panel-head-bg` (`shell.css`), a shade off the body, same `var(--ui-border)` on every side.
- Alerts (`ui.prose.callout`, twoslash tag lines alike): type-colour wash, 4px left border + icon, neutral text.
- Parallax is CSS only (scroll-driven, `animation-timeline: view()`): blocks and sections rise in.
  Off under `prefers-reduced-motion` or without browser support.
- Every page template wraps content in a `.site-page` with `data-site`: a page paints in its subsite colours from its
  own markup (no script-set class).
- Mermaid reads `--site-accent` + `--mion-diagram-*` at mount. A diagram's `style X color:var(--site-accent)` lines
  get the computed value substituted before render (mermaid wants literal colours).
- Home page titles: every section `h2` (UPageSection title slot, prose `## …` in `.home-features`) runs the animated
  `--site-title-gradient`. Two-tone: `[lead words]{.title-tone}` paints that part a solid pale tint.
  `h3` titles: plain `--ui-text-highlighted`.
- Only a title that is a real link (or a whole-card `::card{to}` link's title) gets a primary-coloured underline.
- Dark mode default, light supported via `:root.dark` / `:root.light`.
