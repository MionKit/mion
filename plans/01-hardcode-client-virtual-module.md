# Plan: Hardcode Client Virtual Module ID

## Context

The client package always needs `virtual:client-mion-aot/*` virtual modules to work (both dev and build). Currently this requires configuring `aotCaches: {customVirtualModuleId: 'client-mion-aot'}` in every vite config that includes the client. This is a separate concern from AOT build options — the client virtual modules should always be registered by the plugin without any configuration.

## Changes

### 1. `packages/devtools/src/vite-plugin/types.ts`

Remove `customVirtualModuleId` from `AOTCacheOptions` (lines 34-45).

### 2. `packages/devtools/src/vite-plugin/constants.ts`

Add a constant for the hardcoded client virtual module prefix:
```typescript
export const CLIENT_AOT_PREFIX = 'client-mion-aot';
```

### 3. `packages/devtools/src/vite-plugin/mionVitePlugin.ts`

**A. Update `buildAOTVirtualModuleMaps` (line 584):**
- Remove the `customVirtualModuleId` parameter
- Always register both `virtual:mion-aot/*` and `virtual:client-mion-aot/*` virtual modules (using the new constant)

**B. Update plugin creation (line 125):**
- Remove `aotOptions?.customVirtualModuleId` argument from `buildAOTVirtualModuleMaps()` call — it now takes no arguments

### 4. `packages/client/vite.config.ts` (line 52-54)

```typescript
// Before:
aotCaches: {
    customVirtualModuleId: 'client-mion-aot',
}
// After:
aotCaches: true,
```

### 5. `packages/client/vitest.config.ts` (line 23-25)

Same change as above.

## Files NOT affected

All other configs don't use `customVirtualModuleId`, so no changes needed. The `virtual:client-mion-aot/*` modules are now always registered (harmless if unused — they just sit in the map).

## Verification

1. `npx vitest run --project devtools`
2. `npm run build -w @mionjs/devtools && npx vitest run --project client`
3. `npm run test`
