# @mionkit/aot-template

### ⚠️ WARNING! This package is auto-generated. Do not modify manually ⚠️

Template package for mion AOT (Ahead-of-Time) cache generation. This package provides pre-built cache and pre-built JIT functions files.

## Overview

This is a package that serves as the foundation for creating AOT cache packages. It contains:

- Pre-built placeholder cache files (router, JIT functions, pure functions)
- TypeScript definitions for all exports
- Support for both CommonJS and ESM modules

### Files

- `router.cache.ts` - Router methods cache
- `jitFns.cache.ts` - JIT functions cache
- `pureFns.cache.ts` - Pure functions cache

### Build Output

The package is pre-built and includes:

- `build/cjs/` - CommonJS modules
- `build/esm/` - ES modules

## Usage (Future)

This template will be used by the upcoming CLI commands:

1. **Create AOT Package**: `npx mion-codegen-create-aot-package --package-name my-api-cache --outdir ./packages/my-api-cache`
2. **Populate Cache**: `npx mion-aot --start-server ./dist/cjs/my-api.js`

## Development

To modify and rebuild the template:

```bash
npm run build
```

The build process uses `isolatedModules` to compile only the template files without following peer dependency imports.

## Dependencies

- `@mionkit/core` (peer dependency)
- `@mionkit/router` (peer dependency)

## License

MIT
