# Documentation Website (one site, three subsites)

Nuxt 4 + Docus v5 docs site. It is a containerized app: its dependencies live only
inside the podman image, never in the monorepo lockfile.

**ONE Nuxt install builds ONE static site, mion.pages.dev, with a subsite per feature:**

| Subsite | URL | Content tree | Theme |
| --- | --- | --- | --- |
| `rpc` (the framework) | `/rpc/introduction/about-mion-rpc` (`/rpc` redirects) | `content/01.rpc/` | `sites/rpc/theme.css` |
| `runtypes` | `/runtypes/introduction/about-mion-runtypes` (`/runtypes` redirects) | `content/02.runtypes/` | `sites/runtypes/theme.css` |
| `benchmarks` | `/benchmarks/introduction/mion-benchmarks` (`/benchmarks` redirects) | `content/03.benchmarks/` (`01.introduction/` + `02.rpc/` + `03.runtypes/`) | `sites/benchmarks/theme.css` |

Each subsite has its OWN sidebar (only its sections), its own colour scheme, and a
home page, the first page of its introduction section (`About mion RPC`, `About mion
RunTypes`, `mion Benchmarks`): a DOCS page, so it renders inside the docs layout with
the sidebar beside it, minus the page header and the TOC (the hero is its header). The subsite root (`/<id>`) redirects to it, in the app router
(`app/pages/<id>/index.vue`, `definePageMeta({redirect})`) and on the static host
(`public/_redirects`); every link to a subsite goes to its `home` (`app/utils/subsites.ts`). The root `/` is a landing page too (`content/index.md`):
one card per subsite (a `.home-subsite` block carrying that subsite's `data-site`),
each with a centered title, the intro text and buttons, and beside them a code example
(the rpc card: the server and the client examples side by side under the intro) or the
live benchmark summary (`HomeBenchTable.vue`). The header shows the mion logo (its own
fixed colour, `--mion-logo-accent`, `AppHeaderLogo.vue`) and the subsite menu
(`SubsiteMenu.vue`, rendered by `AppHeaderCenter.vue`): one button naming the current
subsite in its accent (`Explore` on the root) that opens a popup listing all three, each
with its icon and a one-line intro; the words are exactly `RPC`, `RunTypes`, `Benchmarks`
everywhere (`app/utils/subsites.ts`). Everything else is
shared: components, layouts, server utils, the playground (at `/runtypes/playground`),
and `public/` (fonts, favicon, banners, `_redirects`, the generated `bench-data/` +
`playground-app/`).

How the subsites work, and the files that implement them:

- `app/utils/subsites.ts` is the single source of truth (`SUBSITES`: id, label, title,
  path, icon, description). `useSubsite()` derives the current one from the route.
- `app/plugins/site-attr.ts` puts `data-site="<id>"` on `<html>` (the colour scheme
  keys on it) and the per-section body class.
- `app/app.config.ts` sets `navigation.sub: 'aside'`. That one Docus key is what scopes
  the sidebar to the current top-level section instead of showing the whole tree.
  `DocsAsideLeftTop.vue` is overridden to nothing (the header's subsite menu replaces
  the section anchors Docus would add) and `AppHeaderBody.vue` (the mobile menu) shows
  the subsite list plus the current subsite's sections only.
- `content.config.ts` redefines Docus' `docs` + `landing` collections so that EVERY
  `<dir>/index.md` is a landing page (`landing`) and never a docs page (today only the
  root has one; a subsite's home is its about page, a docs page). **Keep the
  names** `docs` and `landing`: Docus' own pages, search and sitemap query them literally.
- `app/pages/[[lang]]/[...slug].vue` overrides Docus' docs page (a copy, pinned to the
  docus version by `website-theme-contracts.test.ts`) so prev/next never crosses a
  subsite and docs titles end with the subsite's name.
- `legacy-runtypes/` is the redirect-only upload for the old runtypes.pages.dev project.

Build output is at `.output/public`.

- **Prose voice and what a style pass may touch:** the root
  [CLAUDE.md](../../CLAUDE.md) → *Website Documentation* section. That section
  governs the voice; the [Writing guidelines](#writing-guidelines) below govern how a
  page is put together (sections, titles, tables, tips). The rest of this file is the
  mechanical reference (stack, commands, components).
- **Container + image lifecycle:** [CONTAINER.md](CONTAINER.md).
- **Benchmark data the docs read:** [docs/WEBSITE-DOCGEN.md](../../docs/WEBSITE-DOCGEN.md).

## Writing guidelines

Model page: [content/01.rpc/02.server/01.routes.md](content/01.rpc/02.server/01.routes.md).
Read it before writing or restyling any page on any subsite.

- **Clear and very concise.** Say it once, in the fewest plain words. Cut anything that
  does not help the reader do or understand something.
- **One section, one job.** Every section does exactly one of these, straight to the point:
  - **How** to do something, with an example: one sentence saying what it does, then the
    `<code-import>` (or fence) that shows it.
  - **What** a feature is: describe it, then show it.
  - **Why** something is done a particular way: the reason, kept short.
- **Titles name the job, plainly.** Title Case, a noun phrase or a gerund that says what
  the section covers: "Defining a Route", "Registering Routes", "Encoder Strategies",
  "Why Only Serializable Data". No slogan or headline titles ("What's in the box",
  "Fast by construction", "Identity never moves"), no questions, no backticks. A reader
  scanning the table of contents must know what each section is about.
  **A title stands on its own**: it says what the section is about without the page
  title or the paragraph under it. "Rules", "Setup" or "Map Shape" fail; "Lint Rules",
  "Lint Plugin Setup" and "FriendlyText Shape" pass. A named feature (Type Builders,
  Transforms, RunType, FriendlyText) is a fine title word.
  **No code names in a title**: no function, option, flag or keyword names. Write
  "Type Guards", not "Type Guards with createValidateFn"; "Dry Runs", not "Dry Runs
  with --check". The section's first sentence names the API. One section covers one
  thing; two things means two sections, each with its own title.
  Renaming a heading changes its URL anchor: grep the content tree for the old slug
  and update every link.
- **One table per topic, not one per section.** Several small sections in a row, each
  with a small table of the same columns, are one table that got split: join them into
  a single table (add a column for the group when it matters) and drop the sub-headings.
  Keep tables apart only when their columns genuinely differ.
- **Tip or note where something is done a particular way.** A default, a fixed order, a
  gotcha, a recommended form: add a short `::tip` or `::note` right where it applies, one
  or two sentences, never a paragraph.

## Stack

- Framework: Nuxt 4 with the Docus v5 theme layer
- Styling: Tailwind CSS 4 utility-first with Nuxt UI v4 components
- Content: Nuxt Content v3 with MDC (Markdown Components) syntax
- Type annotations: Shiki + Twoslash for server-rendered TypeScript code blocks

## Package manager: pnpm

- This sub-project uses its own `pnpm-lock.yaml` (it is intentionally NOT part of the monorepo root workspace).
- The dependency set and its policy live under `_deps/` (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`), baked into the image at build time. `_deps/pnpm-workspace.yaml` carries the full security policy: exact-pinned versions (`savePrefix: ''`), 30-day `minimumReleaseAge`, `allowNonRegistryProtocols: false`.
- Install: `pnpm install --frozen-lockfile`
- The committed lockfile contains some young transitives (Nuxt+Docus brings hundreds of UnJS-ecosystem deps that release weekly). The age policy applies to FUTURE bumps, not entries already locked.

### Build-script allowlist

- pnpm 11 blocks every dependency `install`/`postinstall` script by default.
- The explicit allowlist lives in `_deps/pnpm-workspace.yaml` under `allowBuilds:` (object form: `{ pkgName: true|false }`). The older `onlyBuiltDependencies:` (array form) was removed in pnpm 11 and is silently ignored.
- Currently only `better-sqlite3: true` is allowlisted (required by `@nuxt/content` to load the native SQLite binding). Other native deps (`@parcel/watcher`, `esbuild`, `sharp`, `unrs-resolver`, `vue-demi`) are explicitly set to `false` — they were tested and are NOT required for `nuxt dev` or `nuxt generate` (binaries either ship via platform-specific optional deps, or the package falls back to a JS implementation).
- A `false` row is only true for the VERSION the lockfile holds. `sharp: false` relies on sharp >= 0.33 shipping its binary as `@img/sharp-<platform>` optional deps; sharp 0.32 fetched it in an install script and has no JS fallback. The website once pinned `@nuxt/image` 1.x (ipx 2, sharp 0.32) while Docus already brought `@nuxt/image` 2.x (ipx 3, sharp 0.34): Nuxt loaded the project's copy, every `/_ipx/` picture answered 500 and the prerender silently shipped pages with broken pictures. `_deps/package.json` now pins the same `@nuxt/image` Docus resolves, `repo-contracts.test.ts` keeps the two equal and rejects any sharp < 0.33 in the lockfile, and `scripts/website/check-static.mjs` fails a build whose pages reference a picture that did not ship.
- Before flipping any of those to `true`, verify the failure mode without it — every addition is an explicit trust decision.

## Development

The site only runs **inside its podman container**. Drive it from the repo root
with `pnpm miondevx website …` ([scripts/website/site.mjs](../../scripts/website/site.mjs)),
never the raw in-container `pnpm run dev`:

```bash
pnpm miondevx website dev [--agent]        # hot-reload server (:3000, or :3100 with --agent)
pnpm miondevx website build [--no-bench]   # build the site (with benchmarks)
pnpm miondevx website preview [--no-build] # serve the static site locally
pnpm miondevx website check [--docs]       # serves-a-page smoke (code-import + twoslash with --docs)
pnpm miondevx website check --static       # serve the BUILT site + assert it is not hollow
pnpm miondevx website shell                # debug shell inside the container
```

**Agents: use `pnpm miondevx website dev --agent`** — a separate container
(`tsrt-website-agent`) on port `:3100` that self-stops after ~5 min idle, so it
never collides with a human's `:3000` server or lingers. Hot-reload polling
auto-enables on macOS (`MION_WEBSITE_POLL=1` forces it anywhere). See the
[website-browser skill](../../.claude/skills/website-browser/SKILL.md) for
browser-driven verification.

In-container scripts (what the commands above ultimately run): `pnpm run dev`,
`pnpm run dev:fresh`, `pnpm run build`, `pnpm run preview`, plus
`pnpm run check-links` (broken code-import paths) and
`pnpm run check-unused-examples`.

## Content organization

- Content lives in `content/` as `.md` files using MDC syntax, one dir per subsite:
  `01.rpc/`, `02.runtypes/`, `03.benchmarks/`. Each subsite dir has a `.navigation.yml`
  (its title and icon) and an `index.md` (its landing page).
- Sections use numbered prefix directories for ordering. The rpc tree:
  `01.introduction/`, `02.server/`, `03.client/`, `04.drizzle-orm/`, `05.platforms/`,
  `06.devtools/`, `09.articles/`. The runtypes tree: `01.introduction/`,
  `02.guide/`, `03.ai-integration/`, `08.diagnostics.md`. The benchmarks tree: `01.introduction/`,
  `02.rpc/` and `03.runtypes/`, one group per family.
- Every root-relative link carries its subsite prefix (`/rpc/server/routes`,
  `/runtypes/guide/validation`, `/benchmarks/rpc/hello-world`); `website-links.test.ts`
  fails on a link that resolves to no page.
- **Every prefix is TWO digits, including new ones.** Nuxt Content sorts them as
  text, so a single-digit set silently reorders the moment a 10th entry appears
  (`1 < 10 < 2`, which is how `10.linting.md` once rendered second in the guide).
  Nothing errors and the diff looks fine; only the rendered nav is wrong. The
  prefix is stripped from the URL, so `1.` and `01.` route identically and padding
  is free. Pinned by `website-content-prefixes` in
  `packages/devtools/test/repo-contracts.test.ts`.
- Each section directory has a `.navigation.yml` with title, icon, and redirect.
- `parked/` holds pages taken off the site but kept whole, each with a comment at the top
  saying why and how to publish it again. It sits outside `content/`, so the collections,
  the link tests and the post-build check never see it.
- Frontmatter supports `title`, `description`, `toc`.
- Each subsite home (the about page) and the root `index.md` are hand-tuned: the densest custom-MDC usage in its tree, and
  off limits to prose-only style passes (API-truth fixes to its examples are still required).
  The root `content/index.md` gets the simplest wording on the site.
- Docus built-in components: `::code-group`, `::note`, `::card`, `::card-group`, `::alert`, `::div{class="..."}`.

## Code Import component

Prefer `<code-import>` over hand-written TypeScript fences: it pulls real files
from `packages/examples/src/`, which are typechecked by the root `typecheck`
script, so doc drift fails CI instead of rotting.

- Processed server-side via the `content:file:beforeParse` hook in `nuxt.config.ts`.
- Implementation: `server/utils/code-import.ts`.
- Paths are relative to the monorepo root (not the website root).
- In dev mode, a Vite plugin watches `packages/examples/src/` and triggers hot reload when examples change.

### Usage

```md
<!-- Import full file -->
<code-import path="packages/examples/src/guide/json-basics.ts" lang="ts" />

<!-- With tab title shown in code-group -->
<code-import path="packages/examples/src/guide/json-basics.ts" lang="ts [json.ts]" />

<!-- Import specific line range (lines="start,end") -->
<code-import path="packages/examples/src/guide/json-basics.ts" lang="ts" lines="1,10" />

<!-- Import between comment markers (markers are stripped from output; preferred) -->
<code-import path="packages/examples/src/guide/json-basics.ts" lang="ts" commentStart="// start-roundtrip" commentEnd="// end-roundtrip" />
```

## Twoslash Code component

- Server-rendered TypeScript code showing the annotations written in the code (`// ^?`
  type queries, `// ^|` completions, errors, `@annotate` callouts); no hover on identifiers.
- Sends code to the `/api/twoslash` endpoint, which uses Shiki + Twoslash to render.
- Loads `.d.ts` files from the first-party packages into a virtual file system for type resolution.
- Results are cached to avoid re-rendering on hot reload.
- Uses MDC block syntax (not HTML tag syntax).
- **Used by the About mion RPC page** (five cards) and the root landing (the server, client
  and run-types cards), and by no runtypes page — those render TypeScript through
  `<code-import>` fences. The endpoint is also verified directly by
  `pnpm miondevx website check --docs`.
- The virtual file system mounts each package's built `.d.ts` at
  `/node_modules/<npm name>/`, so the mount list in `server/api/twoslash.post.ts`
  must use the **published** names (`@mionjs/run-types`, `@mionjs/router`, …), not the
  `packages/` directory names. A mismatch is silent here but breaks every example
  import; `packages/devtools/test/repo-contracts.test.ts` guards it.
- **One endpoint serves every subsite**, so it mounts both scopes. The mount root is
  not written in the list: the endpoint reads each package's `package.json` and mounts
  the directory holding its `.` types entry (`.dist/esm` for core, `.dist/esm/src` for
  the drizzle packages, `dist` for run-types, the committed `lib` for uws), so a
  package's own manifest is the one place its dist layout lives. That means those
  packages must be BUILT: `site.mjs` builds the `@mionjs/*` dists before serving,
  because without them every hover card on the rpc home page renders an error and the
  build still exits 0. `pnpm miondevx website check --docs` renders every landing page card
  through the endpoint and fails on the first one without annotation markup.
- Third-party `.d.ts` come in through a named allowlist (`externalDeps`, today just
  `drizzle-orm`), mirrored by `TWOSLASH_EXTERNAL_DEPS` in `scripts/website/site.mjs`,
  which mounts that one dir into the container. Both ends must move together.

### Usage

```md
::::twoslash-code
---
path: packages/examples/src/_homepage/reflection.ts
title: reflection.ts
---
::::
```

### Props

- `path`: file path relative to the monorepo root (server reads the file)
- `code`: inline TypeScript code (alternative to `path`)
- `title`: filename displayed in the terminal-style header
- `lang`: language, defaults to `ts`
- `hoverMode`: `'explicit'` (default: only the annotations written in the code, `// ^?` queries,
  `// ^|` completions, errors and `@annotate` callouts; no hover on identifiers) or `'all'`
- `class`: CSS classes for layout (e.g. `sm:col-span-2 lg:col-span-2`)

## Examples package

- Located at `packages/examples/src/` — real, compilable TypeScript examples.
- Private package, not published to npm; its build script is a noop.
- Organized by topic: `_homepage/`, `introduction/`, `guide/`, `enrich/`, `suites/`.
- Examples must compile: they import the public package names (`@mionjs/run-types`,
  `@mionjs/devtools`) through the tsconfig `paths`, resolving to the built
  dist `.d.ts` — the published surface.
- Referenced from docs via `<code-import>` and `twoslash-code`.

## Custom Vue components

- Located in `app/components/content/` (auto-imported, usable directly in MDC):
  `BenchTable` (the full per-case table, now only the type-checking page),
  `RuntypesBenchBars` (the runtypes benchmark pages: each group's geometric mean as HTML
  bars, one bar per competitor, linking that group's cases on GitHub),
  `ServerBenchBars` (the rpc benchmark pages: one metric as HTML bars, one
  row per server, no chart library), `HomeBenchTable` (the root landing's
  summary: the fastest servers and validators, read from the same generated datasets the
  benchmark pages read). The three that show geometric means read them from
  `app/utils/benchAggregate.ts`, and the two benchmark-page components format their
  numbers through `app/utils/benchFormat.ts`, so the same measurement never reads two
  ways. Then `StatTiles`, `DiagnosticCatalog`,
  `DetailPanel`, `RealWorldScenario`, `RuntypesPlayground`, `TwoslashCode`,
  `SlidedTitle`, `TypeSafeAnimation`, `StylishList`, `HoverList`, `PlatformTiles`,
  `MionType`, `GradientBg`, `Spacer`, `AppHeaderLogo`, `MionLogo`.
- The Docus overrides
  live beside Docus' own paths (`app/components/app/`, `app/components/docs/`).
- `app/components/global/`: the `mermaid` component for diagrams.
- `app/components/content/go-generated/` holds machine-generated component data
  (e.g. the diagnostics catalog JSON emitted by `pnpm miondevx core codegen`) — never
  hand-edit it.

## Styling

- Global styles: `app/assets/css/mion.css`. It holds the ONE `@theme static` block of the
  site, the `brand` Tailwind palette, whose every shade is a reference
  (`--color-brand-N: var(--site-brand-N)`) and never a hex; then it imports the three
  `sites/<id>/theme.css` files. Tailwind v4 compiles ONE root, and a `@theme` block only
  feeds the utilities when it sits in that root's import graph, so the palette and the
  theme imports live in this file, never in a second entry of `nuxt.config.ts`'s `css`.
  `static` is load-bearing: Nuxt UI only references the shades through runtime `var()`
  strings.
- **Colour scheme: `sites/<id>/theme.css`, and nothing else.** Each subsite fills the
  eleven `--site-brand-N` shades plus six tokens under its `[data-site='<id>']`
  selector: `--site-accent` (hero, playground, header word), `--site-gradient-from` /
  `-to` / `-mix` (the animated section-title gradient, composed once in `mion.css` as
  `--site-title-gradient`), `--site-hue` (decorative `hsl()` gradients) and
  `--site-hue-good` (the "best" end of the bad→good rank ramps, kept green on every
  subsite so heatmaps still read). A `[data-site='<id>'].light, .light [data-site='<id>']`
  block may override the single-valued tokens per mode. `app.config.ts` sets
  `ui.colors.primary: 'brand'`, so `--ui-primary` and the `--color-primary-*` utilities
  follow the subsite (Nuxt UI flips `--ui-primary` between shade 500 in light and 400
  in dark by itself).
  The attribute sits on `<html>` for a subsite page (`plugins/site-attr.ts`). On the
  root landing each intro block carries its own `data-site`, and the `[data-site]`
  bridge in `mion.css` re-derives the brand and Nuxt UI variables on that element,
  because the ones Tailwind declares on `:root` have already resolved there.
  **The shared `app/` tree carries NO site colour**: components consume
  `var(--ui-primary)`, `var(--color-brand-N)`, `color-mix(in srgb, var(--color-brand-500) N%, transparent)`
  for washes, `hsl(var(--site-hue) …)` for hues, and `var(--site-accent)`. No hex,
  no `rgba(138, 168, 94, …)`, no hue constant, no `var(--x, #fallback)`: a fallback
  is a hidden site colour. `packages/devtools/test/website-theme-contracts.test.ts`
  fails on any of them and on a theme.css missing a token.
  A new ramp keeps the mion palette's OKLCH lightness and chroma per shade and only
  changes the hue, so light/dark contrast stays equal shade for shade. Recipe: take
  the rpc ramp's `oklch(L C H)` per shade, swap in the new hue, convert to sRGB hex
  (lower C on any step that falls out of gamut); `--site-accent` is the accent row at
  the new hue, `--site-gradient-from` / `-to` the new 500 / 300, `--site-gradient-mix`
  a partner colour about 120 degrees away, `--site-hue` the HSL hue of the new 500.
- Root landing cards: `.home-subsite` / `.home-subsite-card` / `.home-intro` / `.home-split` in
  `mion.css`. The parallax is CSS alone (scroll-driven animations,
  `animation-timeline: view()`: the card rises in, a soft halo behind it drifts against
  the scroll), and it is off under `prefers-reduced-motion` or in a browser without them.
  Every page template wraps its content in a `.site-page` carrying `data-site`, so a
  page paints in its subsite's colours from its own markup (no class set by script).
- Mermaid diagrams read `--site-accent` at mount, and a diagram's own
  `style X color:var(--site-accent)` lines are substituted with the computed value
  before rendering (mermaid wants literal colours).
- Title treatment on the home pages: every section `h2` (the UPageSection title
  slot, and the prose `## …` headings inside `.home-features`) runs the animated
  `--site-title-gradient`; the card `h3` titles inside a
  section are plain `--ui-text-highlighted` text, and only a title that is a real
  link (or the title of a whole-card `::card{to}` link) carries a primary-coloured
  underline.
- App config: `app/app.config.ts` (Docus theme, SEO, `navigation.sub`, the `primary`
  alias, socials). Nuxt merges app configs with `defu` (project first, per key), so
  Docus' defaults still apply underneath anything it leaves out. Docs page titles end
  with the subsite's `title` (set in `[...slug].vue`); landing pages use their own
  `seo.title` as-is.
- Header wordmark: `MionLogo.vue` (the one mion logo), in `AppHeaderLogo.vue`.
- Favicon: `public/favicon.ico` + `favicon_io/`, one for the whole site.
- Dark mode by default, light mode supported via `:root.dark` / `:root.light`

## Server API endpoints

- `POST /api/twoslash`: renders TypeScript code with Shiki/Twoslash, returns HTML.
- `POST /api/read-file`: reads files from `packages/examples/` only (used by the twoslash component).
