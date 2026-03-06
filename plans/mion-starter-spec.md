# `@mionkit/starter` — Project Scaffolder CLI

## Context

To make mion adoption frictionless, we need a CLI that scaffolds mion into existing meta-framework projects. Currently targets Next.js, designed to be extensible to Nuxt, Remix, etc. The CLI creates an `api/` workspace subdirectory with mion configured alongside the meta-framework.

## Package Location

`packages/starter/` — workspace of the mion monorepo.

## Files

```
packages/starter/
├── index.ts                    # Minimal (CLI-only package)
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vite.config.ts
└── cli/
    ├── index.ts                # Entry point: `npx @mionkit/starter init`
    ├── init.ts                 # Main scaffolding logic
    ├── detect.ts               # Detect project type (Next.js, Nuxt, etc.)
    ├── prompts.ts              # Interactive prompts (no external deps — use readline)
    ├── fileGenerator.ts        # File creation utilities
    └── templates/
        ├── shared/             # Shared across all meta-frameworks
        │   ├── apiPackageJson.ts
        │   ├── apiTsConfig.ts
        │   ├── apiViteConfig.ts
        │   └── apiRoutes.ts
        └── nextjs/             # Next.js-specific templates
            ├── apiServer.ts
            ├── nextCatchAll.ts
            └── rootScripts.ts
```

## Dependencies

```json
{
  "name": "@mionkit/starter",
  "version": "0.7.2",
  "description": "CLI to scaffold mion into meta-framework projects",
  "bin": {
    "mion-starter": "./.dist/esm/cli/index.js"
  },
  "dependencies": {}
}
```

Zero dependencies. Uses Node.js built-in `readline`, `fs`, `path`.

## CLI Flow

### `npx @mionkit/starter init`

1. **Detect project type**: Scan cwd for config files
   - `next.config.{js,ts,mjs}` → Next.js
   - `nuxt.config.{js,ts}` → Nuxt (future)
   - No match → error with instructions

2. **Prompt deployment target** (stdin, no external deps):

   ```
   ? Deployment target:
     > Vercel Serverless (default)
       Standalone Node.js
       Standalone Bun
   ```

3. **Prompt API base path** (default: `/api/mion`)

4. **Generate shared files** (all meta-frameworks):
   - `api/package.json`
   - `api/tsconfig.json` (with `"reflection": true`)
   - `api/vite.config.ts` (with `mionPlugin`)
   - `api/src/routes.ts` (example routes + exported `MyApi` type)

5. **Generate framework-specific files** (delegated to `@mionkit/nextjs`):
   - For Next.js: `api/src/server.ts`, catch-all route, next.config modifications

6. **Modify root `package.json`**:
   - Add `"workspaces": ["api"]` (or append to existing)
   - Add `dev` and `build` scripts

7. **Print instructions**: `npm install`, `npm run dev`

## Template Content

### `api/package.json` (generated)

```json
{
  "name": "@<project-name>/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/server.js",
  "exports": {".": "./src/routes.ts", "./dist/*": "./dist/*"},
  "scripts": {
    "dev": "vite-node src/server.ts",
    "build": "vite build"
  },
  "dependencies": {
    "@mionkit/core": "^0.7.2",
    "@mionkit/router": "^0.7.2",
    "@mionkit/platform-vercel": "^0.7.2"
  },
  "devDependencies": {
    "@mionkit/devtools": "^0.8.0",
    "@mionkit/platform-node": "^0.7.2",
    "vite": "^7.3.1",
    "vite-node": "^5.3.0"
  }
}
```

Dependencies vary by deployment target (Vercel shown above). Node standalone uses `@mionkit/platform-node` in deps, no `@mionkit/platform-vercel`.

### `api/src/routes.ts` (generated)

```typescript
import {initMionRouter, route, Routes} from '@mionkit/router';

const routes = {
  hello: route((ctx, name: string): string => `Hello ${name}!`),
  getTime: route((ctx): Date => new Date()),
} satisfies Routes;

export const myApi = await initMionRouter(routes, {prefix: 'api/v1'});
export type MyApi = typeof myApi;
```

### `api/vite.config.ts` (generated)

```typescript
import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionPlugin} from '@mionkit/devtools/vite-plugin';

export default defineConfig({
  plugins: [
    mionPlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
    }),
  ],
  build: {
    lib: {entry: resolve(__dirname, 'src/server.ts'), formats: ['es']},
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: [/^@mionkit\//, /^[^./]/],
      output: {format: 'es', entryFileNames: '[name].js'},
    },
  },
});
```

## Extensibility

When adding Nuxt support later:

- Add `cli/templates/nuxt/` with Nuxt-specific templates
- Add detection in `detect.ts` for `nuxt.config.ts`
- `@mionkit/nuxt` package provides runtime helpers (like `@mionkit/nextjs` does for Next.js)
- `@mionkit/platform-vercel` adapter is reused across frameworks

## `starters/nextjs/` Reference Project

Full working Next.js + mion project. Same pattern as `website/`:

- Own `package.json`, `package-lock.json`, `node_modules/`
- NOT in root workspaces
- Contains integration tests

```
starters/nextjs/
├── package.json              # workspaces: ["api"]
├── next.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx          # Uses mion client
│   │   └── api/[...mion]/
│   │       └── route.ts
│   └── lib/
│       └── mion.ts           # initClient<MyApi>() setup
├── api/                      # Mion API workspace
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── routes.ts
│       └── server.ts
└── tests/
    ├── api.spec.ts
    └── e2e.spec.ts
```

## Key Reference Files

| File                   | Role                                              |
| ---------------------- | ------------------------------------------------- |
| `website/package.json` | Standalone project pattern (for starters/nextjs/) |
