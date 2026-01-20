# Twoslash Cache Integration Spec

## Problem Statement

Currently, the twoslash functionality is implemented as:
1. A Vue component (`TwoslashCode.vue`) that renders twoslash code blocks
2. A server API endpoint (`/api/twoslash`) that runs Shiki + twoslash at runtime

This approach has several drawbacks:
- **Runtime overhead**: TypeScript compiler runs on every page load
- **Separate component**: Requires a custom MDC component instead of native code blocks
- **No caching**: Same code is reprocessed on every request
- **Two systems**: Regular code blocks use MDC's Shiki, twoslash uses a separate pipeline

## Desired State

Integrate twoslash directly into the `<code-import>` plugin and MDC's Shiki pipeline:
- Twoslash processing happens at **parse time** (when markdown is processed)
- Results are **cached inline** in the code block as a comment
- MDC's Shiki reads the cache and renders without re-running TypeScript
- Single unified code block syntax for all code examples

## How Shiki's Inline Cache Works

Shiki's documentation site uses `@shikijs/vitepress-twoslash` with inline caching. Here's how it works:

### 1. Cache Format

The cache is stored as a JSON comment on the first line of the code block:

```ts
// @twoslash-cache: {"v":1,"hash":"abc123...","data":"eyJub2Rlcy...base64..."}

// rest of the code
const x = 1;
```

Where:
- `v`: Cache version (currently 1)
- `hash`: SHA256 hash of `${lang}:${code}` for cache invalidation (using Node's built-in `crypto`)
- `data`: Base64-encoded JSON of `TwoslashShikiReturn` (using Node's built-in `Buffer`)

### 2. TwoslashShikiReturn Structure

The cached data contains:
```typescript
interface TwoslashShikiReturn {
  nodes: TwoslashNode[];  // Hover info, errors, queries, highlights
  code: string;           // Processed code (without twoslash directives)
  meta?: {
    extension?: string;   // File extension hint
  };
}
```

### 3. Cache Flow

**Write (at parse/build time):**
1. Run twoslash in `website/server/utils/code-import.ts` with virtual file system
2. Base64-encode the result with `Buffer.from(JSON.stringify(result)).toString('base64')`
3. Generate hash from `${lang}:${code}` using Node's `crypto.createHash('sha256')`
4. Prepend `// @twoslash-cache: {...}` to code block (first line, even before the generated file path comment in dev mode)

**Read (at render time):**
1. Shiki transformer's `typesCache.preprocess()` extracts and removes cache comment
2. `typesCache.read()` decodes with `JSON.parse(Buffer.from(data, 'base64').toString())`
3. Transformer uses cached nodes to render hover popups, etc.
4. TypeScript compiler is **never invoked**

## Implementation Plan

### Phase 1: Modify `code-import.ts`

Move twoslash processing into the code-import plugin:

```typescript
// When twoslash attribute is present:
<code-import path="..." twoslash />

// The plugin will:
// 1. Read the file
// 2. Load virtual file system (fsMap with .d.ts files)
// 3. Run twoslash
// 4. Generate cache comment
// 5. Output code block with cache + twoslash meta
```

**New functions to add:**
- `loadMionPackageTypes()` - Load .d.ts files into fsMap (move from twoslash.post.ts)
- `runTwoslash(code, lang, filePath)` - Run twoslash and return result
- `generateTwoslashCache(result, code, lang)` - Generate cache comment string
- `processTwoslashCodeImport(...)` - Main function for twoslash code imports

**Output format:**
```markdown
```ts twoslash
// @twoslash-cache: {"v":1,"hash":"...","data":"..."}
import { routes } from '@mionkit/router';
// ... rest of code
```                                                   
```

### Phase 2: Create `mdc.config.ts`

Create MDC configuration with twoslash transformer:

```typescript
import { defineConfig } from '@nuxtjs/mdc/config'
import { transformerTwoslash, rendererRich } from '@shikijs/twoslash'

export default defineConfig({
  shiki: {
    transformers: [
      transformerTwoslash({
        explicitTrigger: true,  // Only process ```ts twoslash blocks
        renderer: rendererRich(),
        typesCache: createInlineCacheReader(),  // Custom cache reader
      })
    ]
  }
})
```

**`createInlineCacheReader()` implementation:**
```typescript
const CACHE_REGEX = /^\/\/ @twoslash-cache: (.+)\n/

function createInlineCacheReader(): TwoslashTypesCache {
  return {
    preprocess(code, lang, options, meta) {
      // Extract and remove cache comment
      const match = code.match(CACHE_REGEX)
      if (match) {
        meta.__twoslashCache = match[1]
        return code.replace(CACHE_REGEX, '')
      }
    },
    
    read(code, lang, options, meta) {
      const cacheStr = meta?.__twoslashCache
      if (!cacheStr) return null
      
      try {
        const payload = JSON.parse(cacheStr)
        // Verify hash matches (optional, for cache invalidation)
        const data = Buffer.from(payload.data, 'base64').toString()
        return JSON.parse(data)
      } catch {
        return null
      }
    },
    
    write() {
      // No-op: cache is written by code-import plugin
    }
  }
}
```

### Phase 3: Update Markdown Files

Change from:
```markdown
::twoslash-code
---
path: packages/examples/src/introduction/about-server.ts
---
::
```

To:
```markdown
<code-import path="packages/examples/src/introduction/about-server.ts" twoslash />
```

### Phase 4: Cleanup

Delete files that are no longer needed:
- `website/app/components/content/TwoslashCode.vue`
- `website/server/api/twoslash.post.ts`

### Phase 5: Update Examples and Test

Update the test examples in `website/content/8.twoslash-test/` to use the new syntax:

**Files to update:**
- `1.import-resolution-test.md` - Currently uses `::twoslash-code` component
- `2.code-import-test.md` - Currently uses `::twoslash-code` component (if exists)

**Before:**
```markdown
::twoslash-code
---
path: packages/examples/src/introduction/about-server.ts
---
::
```

**After:**
```markdown
<code-import path="packages/examples/src/introduction/about-server.ts" twoslash />
```

**Testing checklist:**
1. Run `npm run dev` in the website folder
2. Navigate to `http://localhost:3000/twoslash-test/import-resolution-test`
3. Verify TypeScript hover popups appear on symbols
4. Verify import resolution works (no red squiggles on `@mionkit/*` imports)
5. Verify relative imports work (e.g., `./about-server` resolves correctly)
6. Check both light and dark themes render correctly
7. Verify empty lines in code are preserved correctly

use playwrite for testing the website

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `server/utils/code-import.ts` | Modify | Add twoslash processing |
| `mdc.config.ts` | Create | MDC config with twoslash transformer |
| `components/content/TwoslashCode.vue` | Delete | No longer needed |
| `server/api/twoslash.post.ts` | Delete | No longer needed |
| `content/**/*.md` | Modify | Update syntax to use code-import |

## Benefits

1. **Build-time processing**: Twoslash runs once at build, not on every request
2. **Unified syntax**: All code blocks use the same `<code-import>` syntax
3. **Native Shiki integration**: Uses MDC's built-in Shiki pipeline
4. **Cached results**: No re-processing of unchanged code
5. **Simpler architecture**: Fewer components and API endpoints

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Cache invalidation | Hash includes code content, so changes invalidate cache |
| Large cache size | Base64 encoding adds ~33% overhead but keeps things simple; most code blocks are small |
| Build time increase | Twoslash is fast; only runs on `twoslash` blocks |
| fsMap loading | Cache fsMap in memory; load once per build |

