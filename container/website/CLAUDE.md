# RunTypes Documentation Website

Nuxt 4 + Docus v5 docs site for **RunTypes**. It is a containerized app: its
dependencies live only inside the podman image, never in the monorepo lockfile.

- **Prose voice and what a style pass may touch:** the root
  [CLAUDE.md](../../CLAUDE.md) → *Website Documentation* section. That section
  governs; this file is the mechanical reference (stack, commands, components).
- **Container + image lifecycle:** [CONTAINER.md](CONTAINER.md).
- **Benchmark data the docs read:** [docs/WEBSITE-DOCGEN.md](../../docs/WEBSITE-DOCGEN.md).

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
- Before flipping any of those to `true`, verify the failure mode without it — every addition is an explicit trust decision.

## Development

The site only runs **inside its podman container**. Drive it from the repo root
with `pnpm rtx website …` ([scripts/website/site.mjs](../../scripts/website/site.mjs)),
never the raw in-container `pnpm run dev`:

```bash
pnpm rtx website dev [--agent]        # hot-reload server (:3000, or :3100 with --agent)
pnpm rtx website build [--no-bench]   # build the docs site (with benchmarks)
pnpm rtx website preview [--no-build] # serve the static site locally
pnpm rtx website check [--docs]       # serves-a-page smoke (code-import + twoslash with --docs)
pnpm rtx website check --static       # serve the BUILT site + assert every benchmark page renders
pnpm rtx website shell                # debug shell inside the container
```

**Agents: use `pnpm rtx website dev --agent`** — a separate container
(`tsrt-website-agent`) on port `:3100` that self-stops after ~5 min idle, so it
never collides with a human's `:3000` server or lingers. Hot-reload polling
auto-enables on macOS (`RT_WEBSITE_POLL=1` forces it anywhere). See the
[website-browser skill](../../.claude/skills/website-browser/SKILL.md) for
browser-driven verification.

In-container scripts (what the commands above ultimately run): `pnpm run dev`,
`pnpm run dev:fresh`, `pnpm run build`, `pnpm run preview`, plus
`pnpm run check-links` (broken code-import paths) and
`pnpm run check-unused-examples`.

## Content organization

- Content lives in `content/` as `.md` files using MDC syntax.
- Sections use numbered prefix directories for ordering. The current tree:
  `1.introduction/`, `2.guide/`, `3.ai-integration/`, `7.benchmarks/`, plus
  `8.diagnostics.md` and `index.md` (the home page).
- Each section directory has a `.navigation.yml` with title, icon, and redirect.
- Frontmatter supports `title`, `description`, `toc`.
- `index.md` is hand-tuned: the densest custom-MDC usage in the tree, and off
  limits to prose-only style passes (API-truth fixes to its examples are still required).
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
- Loads `.d.ts` files from the RunTypes packages into a virtual file system for type resolution.
- Results are cached to avoid re-rendering on hot reload.
- Uses MDC block syntax (not HTML tag syntax).

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
- Examples must compile: they import the public package names (`@ts-runtypes/core`,
  `@ts-runtypes/devtools`) through the tsconfig `paths`, resolving to the built
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
  (e.g. the diagnostics catalog JSON emitted by `pnpm rtx core codegen`) — never
  hand-edit it.

## Styling

- Global styles: `app/assets/css/mion.css`
- App config: `app/app.config.ts` (Docus theme, SEO, UI colors, socials)
- Dark mode by default, light mode supported via `:root.dark` / `:root.light`

## Server API endpoints

- `POST /api/twoslash`: renders TypeScript code with Shiki/Twoslash, returns HTML.
- `POST /api/read-file`: reads files from `packages/examples/` only (used by the twoslash component).
