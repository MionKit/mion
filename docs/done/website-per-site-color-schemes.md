---
type: feature
spec: full-plan
status: done (2026-09-02)
created: 2026-09-02
---

# Per-site colour schemes for the two docs sites, and the one-run build switch

> Shipped as specified, with these differences: each `theme.css` also carries a
> `:root.light` block so a site can tune its single-valued tokens per mode (runtypes
> uses a darker accent in light mode); the runtypes favicon set was generated in the
> PR (a blue tile rendered with headless Chromium), so only the runtypes banner stays
> an owner action; `build.mjs` calls an exported `buildSite()` instead of a `--no-prep`
> flag; the verification numbers are at the end.

## Problem

Three asks in one spec: per-site colour schemes, the one-run build switch, and moving the
animated title gradient from the small card titles to the big section titles (A.8).

`container/website/` is ONE Nuxt 4 / Docus 5 / Nuxt UI 4 / Tailwind v4 install that builds
TWO sites, runtypes and mion, picked by `MION_SITE`. Per-site files live in
`container/website/sites/<site>/` (app.config.ts, Logo.vue, content/, public/); everything
else is shared under `container/website/app/`. Both sites render in the SAME olive green
today, so nothing tells them apart beyond the logo and the words.

The brand colour is not one knob. Both `sites/*/app.config.ts` say `primary: 'green'`, but
`app/assets/css/mion.css:4-15` OVERWRITES Tailwind's stock `green` ramp globally (no 950
shade, so `--ui-color-primary-950` falls to stock green), `mion.css:18` adds a bespoke punchy
accent `--ui-saturated: #79af43`, a 5-stop animated gradient literal is pasted six times in
`mion.css` plus once in `TypedTitle.vue`, and about 20 components carry green hex fallbacks,
`rgba(138, 168, 94, α)` washes, or green HSL hue constants. Favicons are shared (both sites
ship the mion "m" tile), the banners are green rasters, and `mermaid.vue` hard-codes Nuxt's
`#00dc82`. Changing `primary` alone moves a fraction of the page.

The user also asked for building both sites in one go with a one / other / both switch.
That exists: `pnpm rtx website build --site runtypes|mion|both` (`scripts/website/build.mjs:66-80`,
`both` is the default; stages 1-4 shared, then the per-site loop at `build.mjs:121-149`
runs `site.mjs generate` ONE SITE AFTER THE OTHER, each in its own container with per-site
`.nuxt`/`.data` volumes and one SHARED `tsrt-website-cache` volume). `website-deploy.yml`
already has a `site` input (`both|runtypes|mion`) and deploys each site to its own
Cloudflare Pages project. What is missing: the two Nuxt builds cannot overlap, and the
switch has gaps (below).

Decisions already taken: mion KEEPS the olive green; runtypes gets a NEW hue (proposal:
steel blue, final hexes are the owner's call, recipe in A.6). Parallel build is OPT-IN.

## Plan

Land as ONE PR, commits grouped B (build switch) first, then A (colours), so the fixed
`pr-heavy` job proves both sites still build with the new theme. One commit per migration
class in A.4 so review can diff mechanically.

### Part A: per-site colour schemes

**A.1 One token file per site: `container/website/sites/<site>/theme.css` (new).**
The mion file carries today's values verbatim (so mion is pixel-identical after the
migration); the runtypes file carries the new ramp from A.6.

```css
/* mion brand palette. ONE named Tailwind palette per site; Nuxt UI maps
   ui.colors.primary='brand' onto --ui-color-primary-N: var(--color-brand-N).
   `static` is load-bearing: Nuxt UI references these only through runtime var()
   strings, so without it Tailwind prunes the unused palette. */
@theme static {
  --color-brand-50: #f7f9f4;
  --color-brand-100: #e8edd9;
  --color-brand-200: #d4dfbc;
  --color-brand-300: #bdd09d;
  --color-brand-400: #a3be7a;
  --color-brand-500: #8aa85e;
  --color-brand-600: #728c4d;
  --color-brand-700: #5c7240;
  --color-brand-800: #4a5c35;
  --color-brand-900: #374428;
  --color-brand-950: #232c19; /* NEW shade, extrapolated with the A.6 recipe */
}

:root {
  --site-accent: #79af43;        /* was --ui-saturated: hero, playground, logo fill */
  --site-gradient-from: #8aa85e; /* = brand-500, stops 0/100% of the animated title gradient */
  --site-gradient-to: #bdd09d;   /* = brand-300, the 50% stop */
  --site-gradient-mix: #60a5fa;  /* the partner colour color-mix()ed at 25/75% */
  --site-hue: 145;               /* HSL hue for decorative hsl() gradients */
  --site-hue-good: 130;          /* HSL hue of the "best" end of the bad->good rank ramps */
}
```

Each file also carries a `:root.light { … }` block re-declaring `--site-accent`,
`--site-gradient-from` and `--site-gradient-to`: mion's light values equal its dark
ones (one value serves both modes, as before), runtypes darkens its accent
(`#018bc1`) and gradient stops in light mode so the hero title and the playground
buttons keep contrast on the light ground. The palette itself is mode-independent;
Nuxt UI flips `--ui-primary` between shade 500 (light) and 400 (dark) by itself.

Two hue tokens on purpose: `--site-hue` is decoration; `--site-hue-good` is the SEMANTIC
"best" end of the red->good heat ramps (BenchTable, PerfBars). A blue runtypes can keep
`--site-hue-good` green so heatmaps still read bad->good, or move it to its brand hue; the
site decides, never the component.

**A.2 Loading: `@import '#site/theme.css'` as the THIRD line of `app/assets/css/mion.css`,
NOT a second `css:` entry in `nuxt.config.ts:39`.** Tailwind v4 compiles one root (the file
holding `@import 'tailwindcss'`); `@theme` must sit in that root's import graph to feed the
`brand-*` utilities and be emitted once. A SITE-computed `css:` entry would be a second
root (vars emitted twice, utilities not generated, root detection version-dependent).
`@tailwindcss/vite` resolves `@import` through Vite's resolver, and Nuxt feeds
`nuxt.options.alias` (`nuxt.config.ts:37`, `'#site': SITE_DIR`) into it; that alias already
works for `app/app.config.ts:7` and `AppHeaderLogo.vue:5`. Fallback if the CSS import does
not resolve in the container: add `{ find: /^#site\//, replacement: `${SITE_DIR}/` }` to the
existing `vite.resolve.alias` array in `nuxt.config.ts`. Last resort: `addTemplate` a
`.nuxt/site-theme.css` and `@import '#build/site-theme.css'`. Verify with
`pnpm rtx website check --site runtypes` and `--site mion` (first step of the PR).

`mion.css:1-22` becomes:

```css
@import 'tailwindcss';
@import '@nuxt/ui';
@import '#site/theme.css';

:root {
  width: 100%;
  overflow-x: hidden;
  --ui-radius: 0;
  --site-title-gradient: linear-gradient(
    90deg,
    var(--site-gradient-from) 0%,
    color-mix(in srgb, var(--site-gradient-from) 55%, var(--site-gradient-mix)) 25%,
    var(--site-gradient-to) 50%,
    color-mix(in srgb, var(--site-gradient-from) 55%, var(--site-gradient-mix)) 75%,
    var(--site-gradient-from) 100%
  );
}
```

The `@theme static { --color-green-* }` block (`mion.css:4-15`) and `--ui-saturated`
(`:18`) are deleted. Light/dark parity is unchanged: the palette is mode-independent, Nuxt
UI keeps flipping `--ui-primary` between shade 500 (light) and 400 (dark), and every consumer
that has a `:root.light` / `.dark` variant keeps it.

**A.3 `sites/*/app.config.ts`.** `primary: 'brand'` (`sites/mion/app.config.ts:69`,
`sites/runtypes/app.config.ts:83`). Delete the inert `white` / `black` `{value, raw}`
entries next to it: nothing consumes `#f7f7ff` / `#15131a` anywhere, and that shape is not a
Nuxt UI 4 colour alias. State in the PR: Nuxt UI's default `success: 'green'` currently
renders olive ONLY because the stock green was overwritten; after this change `success`
(tip callouts, success badges) is stock Tailwind green. Accept it (semantic, not brand);
if the owner wants it brand-tinted, add `success: 'brand'` per site, never resurrect the
green overwrite. No `text-green-*` / `bg-green-*` utilities exist under `app/` or `sites/`.

**A.4 Migrate every shared consumer, so `app/` carries ZERO site colour.** One pattern per
class; the line pointers are today's.

1. `var(--ui-primary, #79af43)` -> `var(--ui-primary)` (the var is always set on `:root`).
   `BenchTable.vue` (949, 1035, 1091, 1104, 1121, 1141, 1240, 1273, 1311), `DetailPanel.vue`
   (91, 98, 145, 190, 201, 262), `BenchColumnInfo.vue:116`, `RealWorldScenario.vue:24`,
   `TypedTitle.vue:373-374` (also fix the `--ui-primary0` typo on 374, drop both `#4ade80`
   fallbacks). Same for `var(--color-primary-600, #6b8e3d)` / `var(--color-primary-400, #a8c87e)`
   at `ServerBenchTable.vue:186/190`, and `var(--color-green-500, #79af43)` at
   `DiagnosticCatalog.vue:182/228/312` -> `var(--color-brand-500)`.
2. `rgba(138, 168, 94, α)` (= brand-500 at alpha) ->
   `color-mix(in srgb, var(--color-brand-500) <α×100>%, transparent)`. Inside a
   `var(--ui-border, rgba(...))` fallback, drop the fallback. `BenchTable.vue` (21 sites:
   956, 989, 1005, 1055, 1085, 1092, 1115, 1142, 1145, 1150, 1171, 1190, 1200, 1208, 1272,
   1291, 1306, 1395, 1411, 1417, 1430), `BenchChart.vue` (125, 130-131, 137-138, 141-142,
   151, 156-157, 163-164, 170), `DetailPanel.vue` (108, 139, 233), `ServerBenchTable.vue:166`,
   `BenchColumnInfo.vue:90`.
3. `--color-green-N` -> `--color-brand-N`, same shade. `mion.css` 64-65, 69-70 (selection),
   88, 92, 96, 100 (section titles), 925 (tsgo badge); `HoverList.vue` 56, 58, 67;
   `TwoslashCode.vue` 333, 340.
4. `--ui-saturated` -> `--site-accent`. `TypedTitle.vue:264`, `GradientBg.vue:57-58` (drop
   the `#22c55e` fallbacks), `PlaygroundStage.client.vue:964/966` (drop `#79af43`).
   `PlaygroundStage.client.vue:965` `--rtpg-accent-dim: #5d8a32` ->
   `color-mix(in srgb, var(--site-accent) 75%, black)`.
5. The 5-stop animated gradient: the six literal copies in `mion.css` (112-120, 158-166,
   174-182, 201-208, 382-389, 423-430) are replaced by the single
   `var(--site-title-gradient)` token, applied where A.8 says (the h2 rules), not where the
   copies sit today. `TypedTitle.vue:267-274` keeps its own composition (the hero uses the
   accent at 0/50/100%): `var(--gradient-color, #22c55e)` -> `var(--site-accent)`,
   `#60a5fa` -> `var(--site-gradient-mix)`, delete the `--gradient-color` indirection on 264.
6. Hard-coded no-var greens: `BenchTable.vue:1467/1477` `#86b94a` -> `var(--site-accent)`
   (dark), `:1474` `#4e7d1e` -> `var(--color-brand-700)` (light).
7. Hue constants -> numeric tokens inside `hsl()`.
   `mion.css:272` `.ai-step:nth-child(1)`: `hsl(var(--site-hue) 70% 52%), hsl(calc(var(--site-hue) + 38) 66% 56%)`.
   `StatTiles.vue:42-43`: when no `hue` prop is given emit the token form above; explicit
   per-tile hues from content (the blue / purple tiles) stay numeric.
   `PerfBars.vue:28-31`: `hsl(calc(50 + ${rank} * (var(--site-hue-good) - 50)) 60% 47%)`
   (best-bar endpoint 140 -> 130 on mion, not perceptible; note it in the PR).
   `BenchTable.vue:1327/1349/1354`: `hsl(calc(var(--rank) * var(--site-hue-good)) ...)`;
   `:1100` legend: `hsl(0 55% 50%), hsl(calc(var(--site-hue-good) / 2) 55% 50%), hsl(var(--site-hue-good) 55% 50%)`.
8. mermaid. `app/components/global/mermaid.vue:24-31`: on mount read
   `getComputedStyle(document.documentElement).getPropertyValue('--site-accent')` and use
   it for `primaryColor` / `primaryBorderColor` (client-only component). Mermaid `style`
   lines need literal colours, so before `render()` substitute `var(--name)` occurrences in
   the slot text with the computed value, and rewrite
   `sites/mion/content/02.server/02.middle-fns.md:91,106` from `style B color:#00dc82` to
   `style B color:var(--site-accent)`. The amber `#f59e0b` on 105 is semantic, untouched.
9. Data-URI SVG icons, `StylishList.vue:60/64` (`#22c55e` / `#4ade80` URL-encoded):
   `currentColor` does not inherit inside a data-URI SVG, so switch the check variant to
   `mask-image` (black stroke in the SVG) + `background-color: var(--color-brand-500)`,
   `:root.dark` -> `var(--color-brand-400)`. The blue info icon (73/78) is not site colour.
10. Per-site logo. `sites/mion/Logo.vue:20,26` `fill: #79af43` -> `fill: var(--site-accent)`.
    `sites/runtypes/Logo.vue:19` already uses `var(--color-primary-500)`.

Untouched on purpose (not site colour): the blue partner / info icons, `#3178c6` TS badge,
the amber experimental pill, `--rt-note`, the red end of the heat ramps, Shiki themes.

**A.5 Per-site assets.**
- Favicons: `git mv` `container/website/public/favicon.ico` and `public/favicon_io/*` into
  `sites/mion/public/` (same relative paths; nothing references them by config, the browser
  fetches `/favicon.ico` by convention, and `nitro.publicAssets` at `nuxt.config.ts:79`
  layers the site dir over the shared one). runtypes got its OWN tile in the new hue
  (`sites/runtypes/public/favicon.ico` + `favicon_io/`): a rounded brand-blue square with
  a white "rt", rendered from a one-line HTML tile with headless Chromium at
  512/192/180/32/16 px, the `.ico` wrapping the 16 and 32 px PNGs (see its `about.txt`).
  Both `site-web-manifest` files carry `name` / `short_name` / `theme_color`. The
  unreferenced `public/logo-web.svg` (`#649037`) is deleted.
- Banners: no generator exists. `sites/runtypes/public/banners/runtypes-banner.png` is still
  the green render and must be re-done in the blue scheme by hand (owner/design action; the
  `design` skill can draft it). The mion banner stays.

**A.6 Palette recipe (hue is the parameter).** Measured OKLCH of the olive ramp; the new
ramp keeps L and C per shade and only changes H, so light/dark contrast is unchanged:

| shade | L | C |
|---|---|---|
| 50 | 0.979 | 0.007 |
| 100 | 0.937 | 0.027 |
| 200 | 0.886 | 0.048 |
| 300 | 0.830 | 0.072 |
| 400 | 0.765 | 0.096 |
| 500 | 0.691 | 0.106 |
| 600 | 0.604 | 0.093 |
| 700 | 0.521 | 0.078 |
| 800 | 0.449 | 0.064 |
| 900 | 0.367 | 0.049 |
| 950 | 0.290 | 0.035 |
| accent | 0.693 | 0.151 |

Shipped for runtypes: OKLCH hue 235 (the ramp in `sites/runtypes/theme.css`, accent
`#00a9ea`, light accent `#018bc1`, `--site-hue` 201, partner `#a78bfa`). Emit `oklch(L C H)` per row and convert
to sRGB hex (oklch.com, or a throwaway `culori` script whose OUTPUT is committed, never the
script); if a step is out of gamut, reduce C for that step only. `--site-accent` = the accent
row at H; `--site-gradient-from` / `-to` = the new 500 / 300; `--site-gradient-mix` = a
partner colour rotated about +120 degrees from H (with a blue brand, keep it warm, e.g. a
soft amber, since `#60a5fa` would vanish into the brand); `--site-hue` = HSL hue of the new
500; `--site-hue-good` stays 130 unless the owner wants blue heatmaps.

**A.7 `nuxt.config.ts:33-34`.** `site: { name: SITE === 'mion' ? 'mion' : 'mion' }` names
both builds "mion"; make the runtypes branch `'RunTypes'`.

**A.8 Move the animated gradient from the small card titles to the section titles.**
On both home pages every section has one big h2 title (`h2[data-slot='title']`, the
UPageSection title slot) and the cards inside carry smaller h3 titles, some of them links.
Today the animation sits on the SMALL titles: `mion.css:112-126` `.home-features h3`,
`197-214` `.ai-steps-head h3`, `377-395` `.rt-feature-card h3`, `418-436` `.rt-object-fns h3`
all run `gradient-flow`, while the only big title with it is `.ai-section h2` (`158-172`,
plus its icon at `174-187`). Invert it:
- `h2[data-slot='title']` (`mion.css:86-88`, every section title) gets
  `background: var(--site-title-gradient); background-clip: text; -webkit-background-clip: text;
  -webkit-text-fill-color: transparent; background-size: 200% 100%; animation: gradient-flow 12s linear infinite;`.
  Delete the now-redundant `.ai-section h2` copy (keep `.ai-title-icon`, it is a background on
  an icon, not text). `.home-features h2` / `.home-features h2 a` (`90-97`) lose their flat
  `--color-brand-500` colour so the gradient shows through the link too; check a linked h2
  renders the gradient (the `-webkit-text-fill-color` inherits, the background is clipped on
  the parent box).
- The four h3 rules lose `background*`, `-webkit-background-clip`, `-webkit-text-fill-color`
  and `animation`, keeping their size / margin lines. Delete the `--color-brand-400` base
  colour at `99-101` too. Same treatment for the toolbelt / AI-artifact card titles at
  `656-663` if they carry the gradient at implementation time.
- Card titles are REGULAR text colour, all of them. Today the h3 titles without a link
  render in a dimmer, less vivid white than the linked ones. Find what dims them (candidates:
  the Docus card title slot / `.group > p` styling, a `--ui-text-muted` or opacity rule, the
  gradient's mid-stop) and remove it, then ONE rule for every section-card title
  (`.home-features h3`, `.ai-steps-head h3`, `.rt-feature-card h3`, `.rt-object-fns h3`,
  `.home-toolbelt .group > p`, `.ai-artifacts .group > p`):
  `color: var(--ui-text-highlighted)`, no opacity.
- Titles that ARE links get an underline in the primary colour. Docus wraps every heading in
  an auto-anchor `a[href^="#"]` (the `.rt-object-fns h4 a` rule at `458-463` already
  neutralises that one), so the selector must skip it: within those title rules,
  `a[href]:not([href^="#"]) { color: inherit; text-decoration: underline;
  text-decoration-color: var(--ui-primary); text-underline-offset: 0.15em; }` and the
  auto-anchor keeps `text-decoration: none; color: inherit`. A `::card` with a `to:` prop is
  one big link, so its `.group > p` title counts as linked and gets the same underline
  (Docus renders such a card as an `a.group`, so `a.group > p` is the hook). Verify on both home pages that
  a linked title (e.g. a `### [Title](/guide/...)` heading or a card title with a link) shows
  the underline and an unlinked one shows none, in light and dark.
- Not touched: the hero title (`TypedTitle.vue`, its own gradient), `.ai-step-num`
  (numbers, hsl gradients), `.rt-formats-tile h4` (blue, static, a tile label not a title).

### Part B: the one-run build switch and `--parallel`

**B.1 Keep what exists, document it** (`--site both` on `build`, the deploy input).

**B.2 `--parallel` (opt-in, also `MION_WEBSITE_PARALLEL=1`), default sequential.** Four
blockers to remove first:
1. Container names collide: `site.mjs:275/281` name every run `${containerBase}-build` /
   `-generate`. Make it `${containerBase}-${cmd}-${site}` unconditionally.
2. The shared cache volume: `site.mjs:81/117` mounts one `tsrt-website-cache` at
   `/app/node_modules/.cache` for both sites; two writers are not safe. Per-site
   `${containerBase}-cache-${site}`, and add them to `siteVolumes` in
   `scripts/container/image.mjs:130` so `container clean` drops them.
3. Pre-stage race: `site.mjs:453-456` runs `ensureMionDists` (writes `packages/*/dist`) and
   `ensurePlayground` (writes bind-mounted dirs) per invocation. Hoisted: `build.mjs` already
   runs the playground build at stage 4; `ensureMionDists(site)` is exported and called once
   in `build.mjs` when the site list includes mion, and the per-site build goes through the
   new exported `buildSite(target, site, {parallel})`, which builds its config from an
   explicit env and skips both pre-stages (no `--no-prep` flag needed).
4. `run()` in `scripts/lib/proc.mjs:73` is `spawnSync`. Add `runAsync(cmd, args, {prefix})`
   (piped output, lines prefixed `[runtypes] ` / `[mion] `), an async `buildAndCopyOut`
   (`site.mjs:238-269`; the `.output/.staging-<site>` dir is already site-scoped; the
   sequential path keeps inherited stdio), and build each site's config from
   `{...process.env, MION_SITE: site}` instead of mutating `process.env.MION_SITE`
   (`build.mjs:122`) across concurrent tasks.

`build.mjs`: when `sites.length > 1 && parallel`, `Promise.allSettled` the generates, then
die naming every failed site; stage 6 (`check-static`) and the zip stay sequential
afterwards. Log elapsed seconds per site in the step banners so a later "flip the default"
decision has numbers. `rt.mjs` passes `--parallel` through like `--skip-playground`. Soft
guard: read `podman info --format '{{.Host.MemTotal}}'` and warn under ~14 GiB.

Why default OFF: each container gets a 6 GB V8 heap plus native memory; the deploy runner
and `ubuntu-latest` are 16 GB, a default macOS podman machine is 2-8 GB, and a deploy OOM
costs more than the minutes saved. CI stays sequential in this PR. A per-site CI matrix was
rejected: it would duplicate stages 1-4 (including the multi-minute benchmarks) and split the
published numbers across two runs.

**B.3 Gaps in the switch, fixed in the same PR.**
- `scripts/rt.mjs:45-50` `takeFlag` only takes `--site X`; also accept `--site=X` (the leaf
  scripts already do).
- `scripts/rt.mjs:305-308`: `--site both` is accepted on `dev`, `check`, `preview`,
  `container-build`, `shell` and silently falls back to runtypes. New rule: `container-build`
  and `check` (both `--static` and smoke / `--docs`) loop the sites sequentially;
  `dev`, `preview`, `shell` die with "--site both is not meaningful for <sub>; pick one".
  Import `SITES` from `scripts/lib/env.mjs`.
- `.github/workflows/pr-heavy.yml:72-73`: the step says "Build both docs sites" but runs
  `container-build` with no `--site` (runtypes only). Use `--site both`.
- `scripts/lib/env.mjs` REGISTRY: new row `MION_WEBSITE_PARALLEL` (scope `dev`), mirrored
  as a commented row in `.env.sample`.
- `container/website/README.md:3` still says the install only serves runtypes.pages.dev.

## Tests

1. New `packages/devtools/test/website-theme-contracts.test.ts` (project `devtools-core`,
   `include: ['test/**/*.test.ts']`; same read-the-files style as
   `repo-contracts.test.ts:512-557`, no Nuxt):
   - `website-no-site-colour`: walk `container/website/app/**/*.{vue,css,ts,mjs}`,
     `sites/*/Logo.vue`, `sites/*/content/**/*.md`; fail on any of `#79af43`, `#8aa85e`,
     `#bdd09d`, `#a3be7a`, `#22c55e`, `#4ade80`, `#86b94a`, `#4e7d1e`, `#5d8a32`, `#649037`,
     `#00dc82`, `#6b8e3d`, `#a8c87e`, `rgba\(\s*138\s*,\s*168\s*,\s*94`, `--color-green-`,
     `--ui-saturated`, `--ui-primary0`, `hsl\(\s*145\b`, `hue = 145`, `\* 130deg`,
     `50 \+ rank`, `%2322c55e`, `%234ade80` (case-insensitive), reporting `file:line`.
   - `website-theme-tokens`: exactly two `sites/*/theme.css`; each has `@theme static {`,
     all eleven `--color-brand-N` as `#rrggbb`, the four `--site-*` colour tokens as hex and
     the two hue tokens as integers; the two `--color-brand-500` differ. Each
     `sites/<site>/app.config.ts` matches `primary:\s*'brand'` and has no `white:` /
     `black:` colour entries. `mion.css` contains `@import '#site/theme.css'` and no `@theme`.
   - `website-sites-mirror`: `SITES` in `scripts/lib/env.mjs` equals `SITES` in
     `container/website/site.config.ts`; `website-deploy.yml` `options:` equals
     `['both', ...SITES]`; `pr-heavy.yml`'s `container-build` line carries `--site both`;
     `sites/<site>/public/favicon.ico` exists per site and the shared one is gone.
2. `container/website/tests/theme.spec.ts` (Playwright, the harness is wired but has no
   specs): on `/`, `--color-brand-500` on `:root` equals the hex parsed from the selected
   site's `theme.css` and `--ui-primary` is non-empty. The shared image has no Playwright
   browsers, so this is the MANUAL check via the `website-browser` skill, run once per site
   in light and dark before merging (this PR drove the bundled Chromium through
   playwright-core, since playwright-cli looks for Google Chrome); the values are in the PR.
3. Existing gates stay green: `pnpm rtx website check --site runtypes` and `--site mion`,
   `pr-heavy` with the `website` label (now really both sites), `pnpm test`,
   `pnpm run check:env`, `pnpm run lint`, `pnpm run format`.
4. Parallel: `pnpm rtx website build --site both --no-bench --parallel` once, record peak
   `podman stats` and the per-site elapsed times in the PR.

## Docs

- `container/website/CLAUDE.md`: the per-site file list gains `theme.css` and favicons, the
  shared `public/` loses favicons; the `--site` section gains `both` on `container-build` /
  `check`, the `--site=X` form and `build --parallel`; the Styling paragraph describes the
  token layer, the "no site colour in `app/`" rule with the token names, the palette
  recipe pointer and the mermaid `var(--x)` substitution.
- `container/website/CONTAINER.md`: `MION_SITE` row mentions `both`; new
  `MION_WEBSITE_PARALLEL` row; per-site cache volumes.
- `container/website/README.md:3`, `scripts/lib/env.mjs` REGISTRY, `.env.sample`.
- No public docs page: contributor-only. The content trees change only on the two mermaid
  `style` lines.

## Fuzzing

Not a candidate: no oracle beyond "the literal is absent", which the contract test pins.

## Out of scope

- The final runtypes hexes (owner picks the hue; recipe in A.6).
- Re-rendering the runtypes banner and drawing the runtypes favicon tile (design actions).
- Per-site `success` / `info` / `warning` semantic colours; the blue partner, amber, red
  and TS-blue literals; Shiki themes.
- Re-rendering mermaid on theme toggle (it is pinned to `theme: 'dark'` today).
- A per-site CI matrix; adding Playwright browsers to the shared image; flipping
  `--parallel` to default (follow-up after a measured run).
- A light-mode redesign; the runtypes text-logo design.

## Done when

- `pnpm rtx website build --site runtypes|mion|both` and `container-build --site both` /
  `--site=both` work; `dev` / `preview` / `shell --site both` fail loudly; `pr-heavy` builds
  both sites; `--parallel` builds both in concurrent containers with no name or volume
  collision and per-site elapsed times logged.
- `container/website/app/**` and `sites/*/Logo.vue` contain none of the forbidden literals;
  each `sites/<site>/theme.css` defines the full token set; both app.configs use
  `primary: 'brand'`; `website-theme-contracts.test.ts` and the env mirror test pass.
- mion renders in today's colours (home hero, bench tables, playground, selection colour)
  in both modes; runtypes renders in its new scheme, including logo, favicon, mermaid nodes
  and StylishList checks.
- On both home pages every section h2 runs the animated gradient (linked ones included) and
  no h3 inside a section card animates; every card title renders in the default highlighted
  text colour at full opacity, and only titles that are real links carry a primary-coloured
  underline. `website-no-site-colour` also fails on `animation: gradient-flow` under any
  `h3` rule in `mion.css`.
- Both sites' `<title>` shows the right site name; `pnpm rtx website check --site …` is
  green for both.
- CLAUDE.md, CONTAINER.md, README.md and `.env.sample` updated; this spec moved to
  `docs/done/`.
