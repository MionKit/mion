# Website server: code import, twoslash, API

How TypeScript examples reach a page. Read before writing an example or editing `server/`.

## Code Import component

- Prefer `<code-import>` over hand-written TS fences: it pulls real files from `packages/private-examples/src/`,
  typechecked in CI (mion half: root `check-types-examples`; runtypes half: `typecheck`). Drift fails CI.
- Processed server-side by the `content:file:beforeParse` hook in `nuxt.config.ts`. Code: `server/utils/code-import.ts`.
- Paths relative to the monorepo root, not the website root.
- Dev: a Vite plugin watches `packages/private-examples/src/` and hot-reloads on example changes.

- Full file: `<code-import path="packages/private-examples/src/guide/ser-json-basics.ts" lang="ts" />`.
- Tab title in a code-group: `lang="ts [json.ts]"`. Line range: `lines="1,10"` (start,end).
- Between comment markers (preferred, markers stripped from output):
  `commentStart="// start-basics" commentEnd="// end-basics"`.

## Examples package

- `packages/private-examples/src/`: real, compilable TS. Private, not published; build script is a noop.
- Topics: `_homepage/`, `introduction/`, `guide/`, `enrich/`, `suites/`.
- Must compile: import public names (`@mionjs/run-types`, `@mionjs/devtools`) via tsconfig `paths` → built dist
  `.d.ts` (the published surface).
- Used by `<code-import>` and `twoslash-code`.
- Writing an example: [The ideal section](../AGENTS.md#the-ideal-section), step 3.

## Twoslash Code component

- Server-rendered TS showing only annotations written in the code (`// ^?` queries, `// ^|` completions, errors,
  `@annotate` callouts). No hover on identifiers.
- Sends code to `/api/twoslash` (Shiki + Twoslash). Loads first-party `.d.ts` into a virtual FS. Results cached
  (no re-render on hot reload). MDC block syntax, not HTML tag syntax.
- Used by the About mion RPC page (five cards) + root landing (server, client, run-types cards). No runtypes page:
  those use `<code-import>` fences. `pnpm miondevx website check --docs` also checks the endpoint directly.

```md
::::twoslash-code
---
path: packages/private-examples/src/_homepage/reflection.ts
title: reflection.ts
---
::::
```

- Props:
  - `path`: file path relative to monorepo root (server reads it). `code`: inline TS (alternative to `path`).
  - `title`: filename in the terminal-style header. `lang`: defaults to `ts`.
  - `hoverMode`: `'explicit'` (default, written annotations only) or `'all'`.
  - `class`: layout CSS classes (e.g. `sm:col-span-2 lg:col-span-2`).

## Twoslash endpoint

- VFS mounts each package's built `.d.ts` at `/node_modules/<npm name>/`: the mount list in
  `server/api/twoslash.post.ts` uses PUBLISHED names (`@mionjs/run-types`, `@mionjs/router`, …), never `packages/`
  dir names. Mismatch is silent here, breaks every example import; `packages/devtools/test/repo-contracts.test.ts`
  guards it.
- One endpoint serves every subsite: mounts both scopes.
- Mount root not in the list: endpoint reads each `package.json`, mounts the dir holding its `.` types entry
  (`.dist/esm` core, `.dist/esm/src` drizzle packages, `dist` run-types, committed `lib` bin-uws).
  A package's own manifest is the one home of its dist layout.
- ⚠️ Those packages must be BUILT: `site.mjs` builds `@mionjs/*` dists before serving.
  Unbuilt → every rpc home hover card renders an error, and the build still exits 0.
- `pnpm miondevx website check --docs` renders every landing card through the endpoint, fails on the first without
  annotation markup.
- Third-party `.d.ts`: named allowlist `externalDeps` (today only `drizzle-orm`), mirrored by
  `TWOSLASH_EXTERNAL_DEPS` in `scripts/website/site.mjs` (mounts that one dir into the container).
  Change BOTH ends together.

## Server API endpoints

- `POST /api/twoslash`: renders TS with Shiki/Twoslash, returns HTML.
- `POST /api/highlight`: plain Shiki colours (`ts` / `js`), no twoslash hovers, for the benchmark hover panels.
  Bad input or failure → `{html: ''}` (client falls back to plain text).
- `POST /api/read-file`: reads files from `packages/private-examples/` only (used by the twoslash component).
