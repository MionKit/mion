# @mionkit/codegen

Transparent AOT (Ahead-of-Time) cache generation and loading for mion applications.

## Overview

The `@mionkit/codegen` package provides transparent AOT cache generation and loading that works automatically with no configuration required. It improves runtime performance by pre-compiling run-types functions and metadata for routes.

## Features

- **Transparent Operation**: Works automatically with no code changes required
- **Automatic Cache Loading**: Caches are loaded automatically during router initialization
- **Automatic Cache Generation**: Caches are generated automatically in compilation mode
- **Binary Tool**: Easy compilation with `mion-compile` command
- **Graceful Fallback**: Application works normally even if caches are missing or corrupted

## Installation

```bash
npm install @mionkit/codegen
```

## Usage

### Normal Application (Zero Configuration)

Your application code requires **no changes** - everything works transparently:

```typescript
// server.ts - NOTHING changes!
import {registerRoutes} from '@mionkit/router';
import {startNodeServer} from '@mionkit/http';

// Router automatically loads caches if available
registerRoutes(routes);

// Server automatically generates caches if MION_COMPILE=true
await startNodeServer();
```

### Cache Generation

```bash
# Build your application
npm run build

# Generate AOT caches (using the binary)
npx mion-compile ./dist/server.js

# Or set environment variable directly
MION_COMPILE=true node ./dist/server.js
```

### Manual Cache Generation (Optional)

If you need to generate caches programmatically:

```typescript
import {generateAOTCaches} from '@mionkit/codegen';

// After your application has been exercised (routes called, types validated)
const result = await generateAOTCaches({
  outputDir: './dist/.mion-cache',
  verbose: true,
});

console.log(`Generated ${result.generatedFiles.length} cache files`);
```

## Environment Variables

- `MION_COMPILE=true` - Enable cache generation and skip server startup
- `MION_CACHE_VERBOSE=true` - Enable verbose logging during generation
- `PRESERVE_TEST_ARTIFACTS=true` - Preserve test artifacts for manual inspection (testing only)

## Debugging

If you need to inspect the generated cache files manually:

```bash
# Run tests and preserve artifacts for inspection
PRESERVE_TEST_ARTIFACTS=true npm test

# Check the generated files
ls -la packages/codegen/.dist/test-cache/
```

## Benefits

- **Zero Configuration**: Works out of the box with no setup
- **Transparent Operation**: No code changes required
- **Automatic Loading**: Caches are loaded automatically during router initialization
- **Automatic Generation**: Caches are generated automatically in compilation mode
- **Graceful Fallback**: Application works normally even if caches are missing or corrupted

## License

MIT
