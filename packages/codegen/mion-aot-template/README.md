# @mionkit/aot-template

Template package for mion AOT (Ahead-of-Time) cache generation. This package provides pre-built cache files and loading functionality for optimal mion application performance.

## Overview

This is a template package that serves as the foundation for creating AOT cache packages. It contains:

- Pre-built placeholder cache files (router, JIT functions, pure functions)
- A `loadAOTCaches()` function for transparent cache loading
- TypeScript definitions for all exports
- Support for both CommonJS and ESM modules

## Architecture

The new AOT architecture eliminates the need for stub file management by providing a self-contained template package that can be instantiated and populated with actual cache files.

### Template Files

- `router.cache.ts` - Router methods cache placeholder
- `jitFns.cache.ts` - JIT functions cache placeholder
- `pureFns.cache.ts` - Pure functions cache placeholder
- `index.ts` - Main entry point with `loadAOTCaches()` function

### Build Output

The package is pre-built and includes:

- `build/cjs/` - CommonJS modules
- `build/esm/` - ES modules
- `build/types/` - TypeScript definitions

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
