# `@mionkit/nextjs` — Next.js Runtime Integration

## Context

`@mionkit/nextjs` provides the runtime logic and utility functions needed to make mion work seamlessly alongside Next.js and turbopack. This includes dev proxy configuration, build orchestration, and any Next.js-specific utilities. Separated from `@mionkit/starter` (generic scaffolding) and `@mionkit/vercel` (platform adapter) for clean concerns.

## Package Location

`packages/nextjs/` — workspace of the mion monorepo.

## Files

```
packages/nextjs/
├── index.ts                    # Barrel export
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vite.config.ts
├── vitest.config.ts
└── src/
    ├── nextConfig.ts           # next.config.ts helpers (dev proxy, rewrites)
    ├── buildOrchestration.ts   # Build order helpers (ensure api/ builds before next)
    ├── devServer.ts            # Dev server coordination utilities
    ├── types.ts                # Shared types
    └── nextConfig.spec.ts      # Tests
```

## Dependencies

```json
{
  "name": "@mionkit/nextjs",
  "version": "0.7.2",
  "description": "Utilities to run mion alongside Next.js",
  "dependencies": {},
  "peerDependencies": {
    "next": ">=14.0.0"
  },
  "peerDependenciesMeta": {
    "next": { "optional": true }
  }
}
```

`next` is an optional peer dependency — the helpers work without it but provide better types when it's present.

## Implementation

### `src/types.ts`

```typescript
export interface MionNextConfig {
    /** Mion API base path in the URL (default: '/api/mion') */
    basePath: string;
    /** Port where mion dev server runs (default: 3001) */
    mionDevPort: number;
    /** Router prefix configured on the mion server (default: 'api/v1') */
    routerPrefix: string;
}
```

### `src/nextConfig.ts` — Next.js Config Helpers

Utilities users import in their `next.config.ts`:

```typescript
/** Creates Next.js rewrites for proxying to mion dev server */
export function mionDevRewrites(opts?: Partial<MionNextConfig>) {
    const config = {...DEFAULT_CONFIG, ...opts};
    return [{
        source: `${config.basePath}/:path*`,
        destination: `http://localhost:${config.mionDevPort}/${config.routerPrefix}/:path*`,
    }];
}

/** Creates a Next.js config modifier that adds mion integration */
export function withMion(mionOpts?: Partial<MionNextConfig>) {
    return (nextConfig: any) => ({
        ...nextConfig,
        async rewrites() {
            const existing = nextConfig.rewrites ? await nextConfig.rewrites() : [];
            const mionRewrites = process.env.NODE_ENV === 'development'
                ? mionDevRewrites(mionOpts)
                : [];
            return Array.isArray(existing)
                ? [...existing, ...mionRewrites]
                : {...existing, fallback: [...(existing.fallback || []), ...mionRewrites]};
        },
    });
}
```

Usage in user's `next.config.ts`:
```typescript
import {withMion} from '@mionkit/nextjs';

export default withMion()({
    // ... existing next config
});
```

Or simpler:
```typescript
import {mionDevRewrites} from '@mionkit/nextjs';

const nextConfig = {
    async rewrites() {
        return process.env.NODE_ENV === 'development' ? mionDevRewrites() : [];
    },
};
export default nextConfig;
```

### `src/buildOrchestration.ts` — Build Helpers

```typescript
/** Returns the build command for the mion api workspace */
export function getMionBuildCommand(workspaceName: string): string {
    return `npm run build -w ${workspaceName}`;
}

/** Returns the combined build command (mion first, then next) */
export function getCombinedBuildCommand(workspaceName: string): string {
    return `npm run build -w ${workspaceName} && next build`;
}
```

### `src/devServer.ts` — Dev Server Coordination

Utility for running both dev servers concurrently:

```typescript
import {spawn} from 'child_process';

export interface DevServerOptions {
    mionDevCommand: string;     // default: 'npm run dev -w @my-app/api'
    nextDevCommand: string;     // default: 'next dev'
    mionPort: number;           // default: 3001
    nextPort: number;           // default: 3000
}

/** Starts both mion and Next.js dev servers */
export function startDevServers(opts: Partial<DevServerOptions> = {}) {
    // Spawn both processes, pipe stdout/stderr
    // Handle SIGINT/SIGTERM for clean shutdown
    // Wait for mion to be ready before starting Next.js (optional)
}
```

### Framework-specific templates (used by `@mionkit/starter`)

`@mionkit/nextjs` exports template generators that `@mionkit/starter` calls when scaffolding:

```typescript
/** Generates api/src/server.ts content for Next.js Vercel deployment */
export function generateServerTemplate(opts: {basePath: string; deployTarget: string}): string

/** Generates src/app/api/[...mion]/route.ts content */
export function generateCatchAllTemplate(opts: {apiWorkspaceName: string}): string

/** Generates next.config.ts modifications */
export function generateNextConfigPatch(opts: MionNextConfig): string
```

### `api/src/server.ts` (generated for Vercel Serverless target)

```typescript
import './routes.ts';
import {createVercelHandler, setVercelHandlerOpts} from '@mionkit/vercel';

setVercelHandlerOpts({basePath: '/api/mion'});
export const {GET, POST, PUT, DELETE, PATCH} = createVercelHandler();

// Dev: start standalone Node server
if (process.env.NODE_ENV !== 'production') {
    const {startNodeServer} = await import('@mionkit/node');
    startNodeServer({port: 3001});
}
```

### `src/app/api/[...mion]/route.ts` (generated)

```typescript
// Imports from pre-built mion API output (Vite-compiled with deepkit types)
export {GET, POST, PUT, DELETE, PATCH} from '@my-app/api/dist/server.js';
```

## Dev Workflow

Two concurrent servers:
1. **Mion** (vite-node): port 3001 — handles API requests with hot reload
2. **Next.js** (turbopack): port 3000 — serves frontend, proxies `/api/mion/*` to mion

Root `package.json` scripts (generated by starter):
```json
{
  "dev": "concurrently \"npm run dev -w @my-app/api\" \"next dev\"",
  "build": "npm run build -w @my-app/api && next build"
}
```

No CORS needed — Next.js proxy makes everything same-origin.

## Production Build (Vercel)

1. `npm run build -w @my-app/api` → Vite compiles with deepkit → `api/dist/`
2. `next build` → bundles catch-all route importing `api/dist/server.js`
3. Single Vercel deployment

**Vercel build command**: `npm run build -w @my-app/api && next build`

## Tests

- Unit test `mionDevRewrites()` and `withMion()` output
- Verify build command generation

## Build & Config

Same patterns as other packages:
- `vite.config.ts` for dual CJS/ESM build
- `vitest.config.ts` for tests
- Add to root workspaces + vitest projects

## Key Reference Files

| File | Role |
|------|------|
| `packages/bun/vite.config.ts` | Build config pattern |
| `packages/aws/vitest.config.ts` | Vitest config pattern |
