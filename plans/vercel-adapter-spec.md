# `@mionjs/platform-vercel` — Vercel Platform Adapter

## Context

Mion has platform adapters for Node.js, Bun, AWS Lambda, and Google Cloud Functions. Vercel serverless functions use the Web standard `Request`/`Response` API (same as Bun), making this a straightforward addition. This adapter enables deploying mion APIs to Vercel (serverless functions, Edge, or standalone Node).

## Package Location

`packages/platform-vercel/` — workspace of the mion monorepo.

## Files

```
packages/platform-vercel/
├── index.ts                    # Barrel export
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vite.config.ts              # Dual CJS/ESM build (pattern: packages/platform-bun/vite.config.ts)
├── vitest.config.ts            # Test config (pattern: packages/platform-aws/vitest.config.ts)
└── src/
    ├── vercelHandler.ts        # Core adapter
    ├── types.ts                # VercelHandlerOptions
    ├── constants.ts            # DEFAULT_VERCEL_OPTIONS
    └── vercelHandler.spec.ts   # Tests
```

## Dependencies

```json
{
  "name": "@mionjs/platform-vercel",
  "version": "0.7.2",
  "description": "mion adapter for Vercel serverless functions",
  "dependencies": {
    "@mionjs/core": "^0.7.2",
    "@mionjs/router": "^0.7.2"
  }
}
```

No Vercel/Next.js dependency — pure Web standard APIs.

## Implementation

### `src/types.ts`

```typescript
export interface VercelHandlerOptions {
    defaultResponseHeaders: Record<string, string>;
    /** Path prefix to strip from incoming URL (e.g., '/api/mion') */
    basePath: string;
}
```

### `src/constants.ts`

```typescript
export const DEFAULT_VERCEL_OPTIONS: VercelHandlerOptions = {
    defaultResponseHeaders: {},
    basePath: '/api/mion',
};
```

### `src/vercelHandler.ts`

Directly adapted from `packages/platform-bun/src/bunHttp.ts` — both use Web `Request`/`Response`.

**Exported functions:**
- `setVercelHandlerOpts(options?)` — configure adapter options
- `resetVercelHandlerOpts()` — reset to defaults (for tests)
- `createVercelHandler()` — returns `{GET, POST, PUT, DELETE, PATCH}` handlers

**Handler logic** (mirrors bunHttp.ts:58-96):
1. Parse URL from `req.url`, strip `basePath` prefix → mion route path
2. Extract `urlQuery` from search params
3. Detect content type: `application/octet-stream` → binary, else → JSON
4. Read body: `req.json()` for JSON (`SerializerModes.json`), `req.arrayBuffer()` for binary (`SerializerModes.binary`)
5. Call `dispatchRoute(path, rawBody, req.headers, responseHeaders, req, undefined, reqBodyType, urlQuery)`
6. `reply()` converts `MionResponse` → Web `Response`
7. `fatalFail()` uses `getRouterFatalErrorResponse()` for unhandled errors

**`reply()` function** (mirrors bunHttp.ts:137-182):
- `SerializerModes.stringifyJson` → `new Response(mionResp.rawBody as string, ...)`
- `SerializerModes.json` → `Response.json(mionResp.body, ...)`
- `SerializerModes.binary` → `new Response(serializer.getBufferView(), ...)` + `serializer.markAsEnded()`

**Key difference from Bun adapter:** No `startBunServer()` / `Bun.serve()`. The Vercel adapter only exports handler functions — it does not start a server. Server lifecycle is managed by Vercel.

### `src/vercelHandler.spec.ts`

Follow `packages/platform-aws/src/awsLambda.spec.ts` pattern:

```typescript
import {initRouter, registerRoutes, resetRouter, route} from '@mionjs/router';
import {createVercelHandler, resetVercelHandlerOpts, setVercelHandlerOpts} from './vercelHandler.ts';

const createRequest = (body: string, path: string, method = 'POST') =>
    new Request(`http://localhost${path}`, {
        method,
        body,
        headers: {'content-type': 'application/json'},
    });
```

Test cases:
- Successful route call (JSON response)
- Validation error (invalid params)
- Custom response headers from route handler
- Default response headers via `setVercelHandlerOpts()`
- Binary serialization mode
- basePath stripping

## Build & Config

**`vite.config.ts`** — same pattern as `packages/platform-bun/vite.config.ts`:
- Dual CJS/ESM output to `.dist/esm/` and `.dist/cjs/`
- External: `@mionjs/core`, `@mionjs/router`, all non-relative imports
- `cjsPackageJsonPlugin`, `vite-plugin-dts`

**`vitest.config.ts`** — same pattern as `packages/platform-aws/vitest.config.ts`:
- `mionPlugin` with deepkit type compilation
- Resolve aliases for `@mionjs/*` packages

**Root changes:**
- Add `"packages/platform-vercel"` to root `package.json` workspaces
- Add `'packages/platform-vercel/vitest.config.ts'` to root `vitest.config.ts` projects

## Key Reference Files

| File | Role |
|------|------|
| `packages/platform-bun/src/bunHttp.ts` | Primary pattern for adapter implementation |
| `packages/platform-bun/vite.config.ts` | Build config pattern (dual CJS/ESM) |
| `packages/platform-bun/src/types.ts` | Options interface pattern |
| `packages/platform-aws/src/awsLambda.spec.ts` | Test pattern |
| `packages/platform-aws/vitest.config.ts` | Vitest config pattern |
