# Documentation Website (two sites, one install)

Nuxt 4 + Docus v5 docs site. It is a containerized app: its dependencies live only
inside the podman image, never in the monorepo lockfile.

**ONE Nuxt install builds TWO separate static sites**, picked by `MION_SITE`:

| `MION_SITE` | Site | Content tree |
| --- | --- | --- |
| `runtypes` (default) | runtypes.pages.dev | `sites/runtypes/content/` |
| `mion` | mion.pages.dev | `sites/mion/content/` |

Per site: the content tree, `app.config.ts` (nav, github block, socials, branding,
SEO), `theme.css` (the colour scheme, see Styling below), `Logo.vue` and `public/`
(banners, favicons, `_redirects`). Shared: every component, layout, server util, the
playground, and the top-level `public/` (fonts and the generated `bench-data/` +
`playground-app/`).

How the selection works, and the three files that implement it:

- `site.config.ts` reads and validates `MION_SITE`, and exports `SITE_DIR`.
- `nuxt.config.ts` aliases `#site` to that dir (so `app/app.config.ts` and the header
  logo resolve the right one at build time) and layers `sites/<site>/public` over the
  shared `public/` through nitro's `publicAssets`.
- `content.config.ts` redefines Docus' `docs` + `landing` collections with the site's
  content dir as their `cwd`. Docus hardcodes `<rootDir>/content` and offers no knob,
  but `@nuxt/content` merges each layer's config BY COLLECTION NAME with the project
  applied last, so redefining those two names is the supported override. **Keep the
  names** `docs` and `landing`: Docus' own pages, search and sitemap query them literally.

Build output is per site, at `.output/<site>/public`.

- **Prose voice and what a style pass may touch:** the root
  [CLAUDE.md](../../CLAUDE.md) → *Website Documentation* section. That section
  governs the voice; the [Writing guidelines](#writing-guidelines) below govern how a
  page is put together (sections, titles, tables, tips). The rest of this file is the
  mechanical reference (stack, commands, components).
- **Container + image lifecycle:** [CONTAINER.md](CONTAINER.md).
- **Benchmark data the docs read:** [docs/WEBSITE-DOCGEN.md](../../docs/WEBSITE-DOCGEN.md).

## Writing guidelines

Model page: [sites/mion/content/02.server/01.routes.md](sites/mion/content/02.server/01.routes.md).
Read it before writing or restyling any page on either site.

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
  **No code names in a title**: no function, option, flag or keyword names. Write
  "Type Guards", not "Type Guards with createValidateFn"; "Dry Runs", not "Dry Runs
  with --check". The section's first sentence names the API. One section covers one
  thing; two things means two sections, each with its own title.
  Renaming a heading changes its URL anchor: grep both content trees for the old slug
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
- Type hovers: Shiki + Twoslash for server-rendered TypeScript code blocks

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
pnpm miondevx website build [--no-bench]   # build BOTH sites (with benchmarks)
pnpm miondevx website preview [--no-build] # serve the static site locally
pnpm miondevx website check [--docs]       # serves-a-page smoke (code-import + twoslash with --docs)
pnpm miondevx website check --static       # serve the BUILT site + assert it is not hollow
pnpm miondevx website shell                # debug shell inside the container
```

`--site runtypes|mion` (or `--site=mion`) picks the site for any of them (it just
sets `MION_SITE`). `--site both` selects both sites: `build` takes it (its default)
and runs the two Nuxt builds one after the other, or at once with `--parallel`
(`MION_WEBSITE_PARALLEL=1`; two containers, ~6 GB heap each, so it is opt-in);
`container-build` and `check` run once per site; `dev`, `preview` and `shell`
drive one container and refuse it. So:

```bash
pnpm miondevx website dev --site mion                  # the mion site on :3000
pnpm miondevx website build --site runtypes            # only the runtypes artifact
pnpm miondevx website build --parallel                 # both artifacts, built at once
pnpm miondevx website container-build --site both      # what pr-heavy runs: both sites compile
pnpm miondevx website check --static --site mion       # gate the built mion artifact
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

- Content lives in `sites/<site>/content/` as `.md` files using MDC syntax.
- Sections use numbered prefix directories for ordering. The runtypes tree:
  `01.introduction/`, `02.guide/`, `03.ai-integration/`, `07.benchmarks/`, plus
  `08.diagnostics.md` and `index.md` (the home page). The mion tree:
  `01.introduction/`, `02.server/`, `03.drizzle-orm/`, `04.client/`, `05.run-types.md`,
  `06.devtools/`, `07.platforms/`, `08.benchmarks/`, `09.articles/`, plus `index.md`.
- **Every prefix is TWO digits, including new ones.** Nuxt Content sorts them as
  text, so a single-digit set silently reorders the moment a 10th entry appears
  (`1 < 10 < 2`, which is how `10.linting.md` once rendered second in the guide).
  Nothing errors and the diff looks fine; only the rendered nav is wrong. The
  prefix is stripped from the URL, so `1.` and `01.` route identically and padding
  is free. Pinned by `website-content-prefixes` in
  `packages/devtools/test/repo-contracts.test.ts`.
- Each section directory has a `.navigation.yml` with title, icon, and redirect.
- Frontmatter supports `title`, `description`, `toc`.
- Each site's `index.md` is hand-tuned: the densest custom-MDC usage in its tree, and
  off limits to prose-only style passes (API-truth fixes to its examples are still required).
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

- Server-rendered TypeScript code with interactive type hovers (like VS Code tooltips).
- Sends code to the `/api/twoslash` endpoint, which uses Shiki + Twoslash to render.
- Loads `.d.ts` files from the first-party packages into a virtual file system for type resolution.
- Results are cached to avoid re-rendering on hot reload.
- Uses MDC block syntax (not HTML tag syntax).
- **Used by the mion home page** (five cards), and by no runtypes page — those render
  TypeScript through `<code-import>` fences. The endpoint is also verified directly by
  `pnpm miondevx website check --docs`.
- The virtual file system mounts each package's built `.d.ts` at
  `/node_modules/<npm name>/`, so the mount list in `server/api/twoslash.post.ts`
  must use the **published** names (`@mionjs/run-types`, `@mionjs/router`, …), not the
  `packages/` directory names. A mismatch is silent here but breaks every example
  import; `packages/devtools/test/repo-contracts.test.ts` guards it.
- **One endpoint serves both sites**, so it mounts both scopes. The mount root is not
  written in the list: the endpoint reads each package's `package.json` and mounts the
  directory holding its `.` types entry (`.dist/esm` for core, `.dist/esm/src` for the
  drizzle packages, `dist` for run-types, the committed `lib` for uws), so a package's
  own manifest is the one place its dist layout lives. That means those packages must
  be BUILT: `site.mjs` builds the `@mionjs/*` dists before serving the mion site,
  because without them every hover card on the mion home page renders an error and
  the build still exits 0. `pnpm rtx website check --docs` renders every home page
  card through the endpoint and fails on the first one without hovers.
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
- `hoverMode`: `'all'` (default, hovers for all identifiers) or `'explicit'` (only `// ^?` annotations)
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
  `BenchChart`, `BenchTable`, `PerfBars`, `StatTiles`, `DiagnosticCatalog`,
  `DetailPanel`, `RealWorldScenario`, `RuntypesPlayground`, `TwoslashCode`,
  `TypedTitle`, `TypeSafeAnimation`, `StylishList`, `HoverList`, `PlatformTiles`,
  `MionType`, `GradientBg`, `Spacer`, `AppHeaderLogo`.
- `app/components/global/`: the `mermaid` component for diagrams.
- `app/components/content/go-generated/` holds machine-generated component data
  (e.g. the diagnostics catalog JSON emitted by `pnpm miondevx core codegen`) — never
  hand-edit it.

## Styling

- Global styles: `app/assets/css/mion.css` (shared by both sites). Its third line,
  `@import '#site/theme.css'`, pulls in the selected site's colour scheme; it has to
  be an import from this file (Tailwind v4 compiles ONE root, and a `@theme` block
  only feeds the utilities when it sits in that root's import graph), never a second
  entry in `nuxt.config.ts`'s `css` array.
- **Colour scheme: `sites/<site>/theme.css`, and nothing else.** Each site defines a
  `brand` Tailwind palette (`--color-brand-50` … `950`, in a `@theme static` block;
  `static` is load-bearing, Nuxt UI only references the shades through runtime
  `var()` strings) plus six tokens on `:root`: `--site-accent` (hero, playground,
  logo fill), `--site-gradient-from` / `-to` / `-mix` (the animated section-title
  gradient, composed once in `mion.css` as `--site-title-gradient`), `--site-hue`
  (decorative `hsl()` gradients) and `--site-hue-good` (the "best" end of the
  bad→good rank ramps, kept green on every site so heatmaps still read). A
  `:root.light` block may override the single-valued tokens per mode. Both
  `app.config.ts` files set `ui.colors.primary: 'brand'`, so `--ui-primary` and the
  `--color-primary-*` utilities follow the site (Nuxt UI flips `--ui-primary` between
  shade 500 in light and 400 in dark by itself).
  **The shared `app/` tree carries NO site colour**: components consume
  `var(--ui-primary)`, `var(--color-brand-N)`, `color-mix(in srgb, var(--color-brand-500) N%, transparent)`
  for washes, `hsl(var(--site-hue) …)` for hues, and `var(--site-accent)`. No hex,
  no `rgba(138, 168, 94, …)`, no hue constant, no `var(--x, #fallback)`: a fallback
  is a hidden site colour. `packages/devtools/test/website-theme-contracts.test.ts`
  fails on any of them and on a theme.css missing a token.
  A new ramp keeps the mion palette's OKLCH lightness and chroma per shade and only
  changes the hue, so light/dark contrast stays equal shade for shade (the recipe is
  in `docs/done/website-per-site-color-schemes.md`).
- Mermaid diagrams read `--site-accent` at mount, and a diagram's own
  `style X color:var(--site-accent)` lines are substituted with the computed value
  before rendering (mermaid wants literal colours).
- Title treatment on the home pages: every section `h2` (the UPageSection title
  slot, and the prose `## …` headings inside `.home-features`) runs the animated
  `--site-title-gradient`; the card `h3` titles inside a
  section are plain `--ui-text-highlighted` text, and only a title that is a real
  link (or the title of a whole-card `::card{to}` link) carries a primary-coloured
  underline.
- App config: `sites/<site>/app.config.ts` (Docus theme, SEO, the `primary` alias,
  socials). `app/app.config.ts` is a two-line re-export through the `#site` alias.
  Nuxt merges app configs with `defu` (project first, per key), so Docus' defaults
  still apply underneath anything a site leaves out.
- Header wordmark: `sites/<site>/Logo.vue`, behind the shared `AppHeaderLogo.vue`.
- Favicons: `sites/<site>/public/favicon.ico` + `favicon_io/` (the browser fetches
  `/favicon.ico` by convention; nitro layers the site's `public/` over the shared one).
- Dark mode by default, light mode supported via `:root.dark` / `:root.light`

## Server API endpoints

- `POST /api/twoslash`: renders TypeScript code with Shiki/Twoslash, returns HTML.
- `POST /api/read-file`: reads files from `packages/examples/` only (used by the twoslash component).
