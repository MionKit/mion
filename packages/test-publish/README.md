# @mionkit/test-publish

> ⚠️ **Internal Package** - This package is private and not published to npm.

Build verification tests for the mion monorepo. This package validates that all mion packages work correctly **after being built**, ensuring that:

- Built artifacts contain proper Deepkit type metadata
- Both ESM and CJS module formats work correctly
- Client-server communication works with built packages
- Binary and JSON serialization work as expected

## Why This Package Exists

During development, tests run against TypeScript source files using `ts-node`. However, published packages use compiled JavaScript with embedded type metadata. This package ensures the build process correctly preserves all type information needed for runtime reflection.

## Prerequisites

**All packages must be built before running these tests:**

```bash
# From the monorepo root
npm run build
```

## Running Tests

These tests are **excluded from the default `npm run test`** command to avoid running them during regular development. Run them explicitly:

```bash
# Run all build verification tests
npm run test:build-verification -w @mionkit/test-publish

# Run only ESM tests
npm run test:esm -w @mionkit/test-publish

# Run only CJS tests
npm run test:cjs -w @mionkit/test-publish

# Run tests in watch mode (for debugging)
npm run dev:test -w @mionkit/test-publish
```

## Test Categories

| Test File                      | Description                                             |
| ------------------------------ | ------------------------------------------------------- |
| `core.spec.ts`                 | Basic utilities, error handling, type validation        |
| `module-formats.spec.ts`       | ESM and CJS import/export compatibility                 |
| `client-server.spec.ts`        | Full client-server interactions with JSON serialization |
| `binary-serialization.spec.ts` | Binary encoding/decoding with complex types             |

## Important Notes

- **Private package** - Not published to npm, only used internally
- **Tests built artifacts** - Imports from `.dist` directories, not source files
- **Requires build first** - All packages must be built before running
- **Sequential execution** - Tests run sequentially to avoid port conflicts
- **Uses @mionkit/test-server** - Depends on the test-server package for server utilities

## When to Run These Tests

1. **Before publishing** - Always run after `npm run build` and before `npm run npm-publish`
2. **After build changes** - When modifying vite configs or build scripts
3. **CI/CD pipeline** - As a separate step after the build step
