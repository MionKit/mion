# @mionkit/build-tests

Build verification tests for the mion monorepo. This package validates that all mion packages work correctly after being built.

## Purpose

This package is designed to:

1. **Verify built packages work correctly** - Tests import from `.dist` directories, not source files
2. **Test ESM and CJS module formats** - Ensures both module formats work as expected
3. **Validate Deepkit type reflection** - Confirms type metadata is preserved in built output
4. **End-to-end testing** - Tests full client-server interactions with JSON and binary serialization

## Prerequisites

Before running these tests, you must build all packages:

```bash
# From the monorepo root
npm run build
```

## Running Tests

```bash
# Run all build tests
npm run test -w @mionkit/build-tests

# Run tests in watch mode
npm run dev:test -w @mionkit/build-tests
```

## Test Categories

- **Core Tests** - Basic utilities and error handling
- **Run-Types Tests** - JIT function generation and type validation
- **Type-Formats Tests** - String, number, and bigint format validation
- **Router Tests** - Route registration and request handling
- **HTTP Server Tests** - Server startup and request processing
- **Client Tests** - Client initialization and remote method calls
- **Binary Serialization Tests** - Binary encoding/decoding
- **Module Format Tests** - ESM and CJS compatibility

## Important Notes

- This package is **private** and not published to npm
- Tests use the built `.dist` files, not source files
- All packages must be built before running these tests
- Tests run sequentially to avoid port conflicts
