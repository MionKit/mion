# AOT Configuration in Router

The router now supports AOT (Ahead-of-Time) cache configuration through the `RouterOptions.aot` property.

## Basic Usage

```typescript
import {initRouter, registerRoutes} from '@mionkit/router';

// Router with default AOT configuration
const router = initRouter();
registerRoutes(routes); // Uses DEFAULT_AOT_CONFIG transparently

// Router with custom AOT configuration
const router = initRouter({
  aot: {
    defaultVerbose: true, // Enable verbose logging
    defaultBaseDir: './build', // Look for caches in ./build
    cacheDirectoryName: '.cache', // Use .cache instead of .mion-cache
    defaultOutputDir: './build/.cache', // Generate caches here
  },
});
registerRoutes(routes); // Uses custom AOT config
```

## Configuration Options

All properties are optional and override `DEFAULT_AOT_CONFIG`:

```typescript
interface AOTConfig {
  /** Default base directory to look for cache files */
  defaultBaseDir: string; // default: './dist'

  /** Cache directory name */
  cacheDirectoryName: string; // default: '.mion-cache'

  /** Default output directory for cache generation */
  defaultOutputDir: string; // default: './dist/.mion-cache'

  /** Default module format for generated files */
  defaultModuleFormat: 'esm' | 'cjs'; // default: 'esm'

  /** Default verbose logging setting */
  defaultVerbose: boolean; // default: false

  /** Environment variable names */
  envVars: {
    verbose: string; // default: 'MION_CACHE_VERBOSE'
    compile: string; // default: 'MION_COMPILE'
  };
}
```

## Benefits

- **Transparent**: AOT caches are loaded automatically during route registration
- **Configurable**: Override any aspect of cache behavior per router instance
- **Consistent**: Single source of truth for all AOT operations
- **Type-safe**: Full TypeScript support for configuration options

## Migration

No breaking changes - existing code continues to work with default configuration:

```typescript
// Before and after - no changes needed
const router = initRouter();
registerRoutes(routes);
```
