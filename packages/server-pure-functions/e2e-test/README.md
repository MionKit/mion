# E2E Test Fixture for Server Pure Functions

This directory contains a simulated monorepo structure for end-to-end testing of the `@mionkit/server-pure-functions` Vite plugin.

## Structure

```
e2e-test/
├── package.json              # Root package.json for the test monorepo
├── integartions.spec.ts      # Integration tests for extraction, registry, and virtual module
├── packages/
│   ├── test-client/          # Simulates a client package that defines pure functions
│   │   ├── package.json
│   │   ├── vite.config.ts    # Vite config with the mionPureFunctions plugin
│   │   └── src/
│   │       ├── pureFns.ts    # Valid pure functions for testing
│   │       └── impureFns.ts  # Invalid (impure) functions for purity enforcement tests
│   │
│   └── test-server/          # Simulates a server package that consumes pure functions
│       ├── package.json
│       └── server.spec.ts    # Server-side E2E tests
```

## How It Works

### Client Package (`test-client`)

The client package contains:

- **`pureFns.ts`**: Pure functions wrapped with `pureServerFn()` that will be extracted
- **`impureFns.ts`**: Impure functions used to test purity enforcement (should fail extraction)
- **`vite.config.ts`**: Configures the `mionPureFunctions` Vite plugin (client mode)

**Important**: Pure functions must use plain JavaScript syntax in their bodies. TypeScript type annotations in function parameters are stripped during extraction, but type annotations inside the function body (like `(x: any) =>`) are not supported.

### Server Package (`test-server`)

The server plugin scans the client's TypeScript source directly - **no client build required**.

The server tests demonstrate:

1. Scanning client source directory for `pureServerFn()` calls
2. Extracting pure functions directly from TypeScript source
3. Generating a virtual module from extracted functions
4. Registering pure functions into `@mionkit/core`'s runtime
5. Executing pure functions and verifying correct behavior

### Server Plugin Configuration

The server plugin uses `clientSrcPath` to point directly to the client's source:

```typescript
// Server vite.config.ts
import {pureFunctionsPlugin} from '@mionkit/server-pure-functions';

export default defineConfig({
  plugins: [
    pureFunctionsPlugin({
      clientSrcPath: '../test-client/src', // Path to client source
    }),
  ],
});
```

This approach:

- **No build order dependency** - Server doesn't need client to build first
- **No disk I/O** - No registry files written to disk
- **Direct source scanning** - Server parses client TypeScript directly
- **Virtual module** - Functions loaded via `virtual:mion-pure-functions`

## Running Tests

From the `server-pure-functions` package directory:

```bash
# Run all tests (including e2e)
npm run test

# Run only the integration tests
npx jest e2e-test/integartions.spec.ts

# Run only the server e2e tests
npx jest e2e-test/packages/test-server/server.spec.ts
```

## Test Scenarios

### Integration Tests (`e2e-test/integartions.spec.ts`)

Tests the extraction, registry, and virtual module generation:

- Extracting pure functions from source
- Parameter and body extraction
- Hash generation and validation
- Registry structure creation
- Purity enforcement (rejecting impure functions)

### Server E2E Tests (`e2e-test/packages/test-server/server.spec.ts`)

Tests the full pipeline from source scanning to execution:

- Direct TypeScript source scanning (no build required)
- Pure function extraction from client source
- Virtual module generation
- Function execution with correct results
- Hash validation between extraction and runtime
