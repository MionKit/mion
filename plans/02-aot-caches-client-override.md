# Plan: Add `aotCachesClient` Override

## Context

When a single `vite.config.ts` serves both client and server builds (e.g., Nuxt SSR), the same `aotCaches` config applies to both. Users need different AOT cache behavior per target — e.g., `excludeReflection: true` only on server builds, or disabling AOT entirely for client.

## API Design

Keep `aotCaches` as the base config. Add `aotCachesClient` as an override for client builds only.

```typescript
export interface MionPluginOptions {
  serverPureFunctions?: ServerPureFunctionsOptions;
  runTypes?: DeepkitTypeOptions;
  /** AOT cache options — applies to all builds unless overridden by aotCachesClient */
  aotCaches?: AOTCacheOptions | true;
  /** Override AOT cache options for client builds (non-SSR). Falls back to aotCaches. Set false to disable AOT for client. */
  aotCachesClient?: AOTCacheOptions | true | false;
  server?: MionServerConfig;
}
```

**Resolution logic** (in `config` hook using `env: ConfigEnv`):

- `env.command === 'serve'` (dev) → use `aotCaches`
- `!env.isSsrBuild && aotCachesClient !== undefined` → use `aotCachesClient`
- otherwise → use `aotCaches`

**Why this works for all cases:**

- Standalone edge: `aotCaches: {excludeReflection: true}` — no override, uses base
- Standalone client: `aotCaches: true` — no override, uses base
- Unified SSR: `aotCaches: {excludeReflection: true}, aotCachesClient: true` — client gets simple config, server gets excludeReflection

## Changes

### 1. `packages/devtools/src/vite-plugin/mionVitePlugin.ts`

**A. Add `aotCachesClient` to `MionPluginOptions` (lines 41-50)**

**B. Add helper:**

```typescript
function normalizeAotOption(opt: AOTCacheOptions | true | false | undefined): AOTCacheOptions | undefined {
  if (opt === false) return undefined;
  if (opt === true) return {};
  return opt;
}
```

**C. Update plugin creation (lines 88-125):**

- `const baseAotOptions = normalizeAotOption(options.aotCaches);`
- `const clientAotOverride = options.aotCachesClient;`
- `let resolvedAotOptions: AOTCacheOptions | undefined = baseAotOptions;`

**D. Add `env` param to `config` hook (line 154) and resolve options:**

```typescript
config(config, env) {
    if (env.command !== 'serve' && !env.isSsrBuild && clientAotOverride !== undefined) {
        resolvedAotOptions = normalizeAotOption(clientAotOverride);
    }
    // ... rest uses resolvedAotOptions
}
```

**E. Replace all `aotOptions` references with `resolvedAotOptions`:**

- `config` hook (lines 158, 169)
- `configResolved` (line 184)
- `resolveId` (lines 303, 307, 308, 313)
- `buildStart` (line 198)
- `handleHotUpdate` (line 510)

### 2. `packages/devtools/src/vite-plugin/mionVitePlugin.spec.ts`

**Update existing tests:** Add `env` arg to all `plugin.config(config)` calls:

```typescript
plugin.config(config, {command: 'build', mode: 'production'});
```

**Add new test group `describe('config hook - aotCachesClient override')`:**

1. Uses `aotCachesClient` when `isSsrBuild: false` and `aotCachesClient` is defined
2. Falls back to `aotCaches` when `isSsrBuild: true`
3. Falls back to `aotCaches` when `aotCachesClient` is not set
4. `aotCachesClient: false` disables AOT for client builds
5. Dev mode (`command: 'serve'`) always uses `aotCaches`

### 3. `packages/examples/src/codegen/vite-client-ssr.config.ts` (optional demo)

Update to demonstrate the unified SSR config:

```typescript
mionPlugin({
    runTypes: {tsConfig: ...},
    aotCaches: {excludeReflection: true},
    aotCachesClient: true,
    server: {startScript: ..., runMode: 'middleware'},
})
```

## No existing configs need migration

All existing configs continue to work — `aotCaches` is unchanged, `aotCachesClient` is purely additive.

## Verification

1. `npx vitest run --project devtools`
2. `npm run build -w @mionjs/devtools && npx vitest run --project client`
3. `npm run test`
