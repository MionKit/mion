# Mion Documentation Website

## Stack
- Framework: Nuxt 4 with Docus v5 theme layer
- Styling: Tailwind CSS 4 utility-first with Nuxt UI v4 components
- Content: Nuxt Content v3 with MDC (Markdown Components) syntax
- Type hovers: Shiki + Twoslash for server-rendered TypeScript code blocks

## Package Manager: pnpm
- This sub-project uses its own `pnpm-lock.yaml` (it is intentionally NOT part of the monorepo root workspace).
- See `pnpm-workspace.yaml` for the full security policy: exact-pinned versions (`savePrefix: ''`), 30-day `minimumReleaseAge`, `allowNonRegistryProtocols: false`. The `.npmrc` here only carries auth/registry settings (everything pnpm-specific moved to `pnpm-workspace.yaml` in pnpm 11).
- Install: `pnpm install --frozen-lockfile`
- The committed lockfile contains some young transitives (Nuxt+Docus brings hundreds of UnJS-ecosystem deps that release weekly). The age policy applies to FUTURE bumps, not entries already locked.

### Build-script allowlist
- pnpm 11 blocks every dependency `install`/`postinstall` script by default.
- The explicit allowlist lives in `pnpm-workspace.yaml` under `allowBuilds:` (object form: `{ pkgName: true|false }`). The older `onlyBuiltDependencies:` (array form) was removed in pnpm 11 and is silently ignored.
- Currently only `better-sqlite3: true` is allowlisted (required by `@nuxt/content` to load the native SQLite binding). Other native deps (`@parcel/watcher`, `esbuild`, `sharp`, `unrs-resolver`, `vue-demi`) are explicitly set to `false` — they were tested and are NOT required for `nuxt dev` or `nuxt generate` (binaries either ship via platform-specific optional deps, or the package falls back to a JS implementation).
- Before flipping any of those to `true`, verify the failure mode without it — every addition is an explicit trust decision.

## Development
- Start dev server: `pnpm run dev` (runs on `http://localhost:3000`)
- Fresh start: `pnpm run dev:fresh` (cleans `.nuxt`, `.data`, `.output` first)
- Build requires all mion packages built first: `pnpm run build` (runs `pnpm run build` at monorepo root, then `nuxt build`)
- Preview production build: `pnpm run preview`
- Check broken code-import paths: `pnpm run check-links`
- Check unused example files: `pnpm run check-unused-examples`

## Content Organization
- Content lives in `content/` as `.md` files using MDC syntax
- Sections use numbered prefix directories for ordering: `1.introduction/`, `3.client/`, `20.server/`, etc.
- Each section has a `.navigation.yml` with title, icon, and redirect
- Frontmatter supports: `title`, `description`, `toc` (table of contents config)
- Docus built-in components: `::code-group`, `::note`, `::card`, `::card-group`, `::alert`, `::div{class="..."}`

## Code Import Component
- Imports real TypeScript code from the monorepo into markdown at build time
- Processed server-side via `content:file:beforeParse` hook in `nuxt.config.ts`
- Implementation: `server/utils/code-import.ts`
- Paths are relative to monorepo root (not website root)
- In dev mode, a Vite plugin watches `packages/examples/src/` and triggers hot reload when examples change

### Usage
```md
<!-- Import full file -->
<code-import path="packages/examples/src/introduction/about-server.ts" lang="ts" />

<!-- With tab title shown in code-group -->
<code-import path="packages/examples/src/introduction/about-server.ts" lang="ts [server.ts]" />

<!-- Import specific line range (lines="start,end") -->
<code-import path="packages/examples/src/router/routes.ts" lang="ts" lines="1,10" />

<!-- Import between comment markers (markers are stripped from output) -->
<code-import path="packages/router/src/types/context.ts" lang="ts" commentStart="// type-mion-request-start" commentEnd="// type-mion-request-end" />
```

## Twoslash Code Component
- Server-rendered TypeScript code with interactive type hovers (like VS Code tooltips)
- Sends code to `/api/twoslash` endpoint which uses Shiki + Twoslash to render
- Loads `.d.ts` files from mion packages into a virtual file system for type resolution
- Results are cached to avoid re-rendering on hot reload
- Uses MDC block syntax (not HTML tag syntax)

### Usage
```md
::::twoslash-code
---
path: packages/examples/src/_homepage/home-server.ts
title: mion-router.ts
---
::::
```

### Props
- `path`: file path relative to monorepo root (server reads the file)
- `code`: inline TypeScript code (alternative to `path`)
- `title`: filename displayed in terminal-style header
- `lang`: language, defaults to `ts`
- `hoverMode`: `'all'` (default, shows hovers for all identifiers) or `'explicit'` (only `// ^?` annotations)
- `class`: CSS classes for layout (e.g. `sm:col-span-2 lg:col-span-2`)

## Examples Package
- Located at `packages/examples/src/` - contains real compilable TypeScript examples
- Private package, not published to npm, build script is a noop
- Organized by topic: `_homepage/`, `introduction/`, `router/`, `client/`, `run-types/`, `type-formats/`, `codegen/`, `drizzle/`, `aws/`, `bun/`, `gcloud/`, `http/`
- Examples must compile without errors (they use real mion package imports)
- Referenced from docs via `<code-import>` and `twoslash-code` components
- Has its own ESLint config requiring explicit return types in `.routes.ts` files
- Lint examples: `pnpm --filter @mionjs/examples run lint`

## Custom Vue Components
- Located in `app/components/content/` (auto-imported, usable directly in MDC)
- `TwoslashCode`: TypeScript code with type hovers
- `BenchChart`: Billboard.js benchmark charts (prop: `id` referencing chart data)
- `TypedTitle`: Animated typing title (props: `leading`, `suffix`, `titles`, `level`)
- `StylishList`: Styled list with icons (prop: `type`: `'info'` | `'check'`)
- `HoverList`: Interactive hover list that toggles CSS classes on body
- `PlatformTiles`: Grid of platform logos
- `MionType`: Type display container (slots: `name`, `code`)
- `GradientBg`: Animated gradient background
- `Spacer`: Simple spacing element
- Global: `mermaid` component for diagrams (in `app/components/global/`)

## Styling
- Global styles: `app/assets/css/mion.css`
- Primary color: green (`--ui-saturated: #79af43`)
- Dark mode by default, supports light mode via `:root.dark` / `:root.light`
- App config: `app/app.config.ts` (Docus theme, SEO, UI colors, socials)

## Server API Endpoints
- `POST /api/twoslash`: Renders TypeScript code with Shiki/Twoslash, returns HTML
- `POST /api/read-file`: Reads files from `packages/examples/` only (used by twoslash component)
