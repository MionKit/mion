# @mionkit/test-publish

> ⚠️ **Internal Package** - This package is private and not published to npm.

Build verification tests for the mion monorepo. This package validates that all mion packages work correctly **after being built**, ensuring that:

- Built artifacts contain proper Deepkit type metadata
- Client-server communication works with built packages
- Binary and JSON serialization work as expected

## Why This Package Exists

During development, tests run against TypeScript source files using `ts-jest`. However, published packages use compiled JavaScript with embedded type metadata. This package ensures the build process correctly preserves all type information needed for runtime reflection.

## How It Works

1. **Clean** - Removes any existing build artifacts (`.dist` folder)
2. **Build** - Compiles TypeScript test files to JavaScript using `tsc`
3. **Test** - Runs Jest against the compiled `.dist/*.spec.js` files (no ts-jest)
4. **Clean** - Removes build artifacts after tests complete

The tests import from the built `@mionkit/*` packages (which resolve to their `.dist` folders), not from TypeScript source files. This ensures we're testing the actual published artifacts.

## Prerequisites

**All mion packages must be built before running these tests:**

```bash
# From the monorepo root
npm run build
```

## Running Tests

These tests are **excluded from the default `npm run test`** command to avoid running them during regular development. Run them explicitly:

```bash
# Run all build verification tests (recommended)
npm run verify -w @mionkit/test-publish

# Or use the longer form
npm run test:build-verification -w @mionkit/test-publish
```

## Test Files

| Test File                   | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| `client.spec.ts`            | Full client-server interactions with JSON serialization |
| `serializer.binary.spec.ts` | Binary encoding/decoding with complex types             |

## Important Notes

- **Private package** - Not published to npm, only used internally
- **Tests built artifacts** - Imports from `@mionkit/*` packages which resolve to `.dist` directories
- **No ts-jest** - Tests run against compiled JavaScript, not TypeScript
- **Auto-cleanup** - Build artifacts are cleaned before and after tests
- **Sequential execution** - Tests run sequentially to avoid port conflicts
- **Uses @mionkit/test-server** - Depends on the test-server package for server utilities

## When to Run These Tests

1. **Before publishing** - Always run after `npm run build` and before `npm run npm-publish`
2. **After build changes** - When modifying vite configs or build scripts
3. **CI/CD pipeline** - As a separate step after the build step

## Scripts

| Script                    | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `verify`                  | Runs all build verification tests              |
| `test:build-verification` | Same as verify - cleans, builds, tests, cleans |
| `build`                   | Compiles TypeScript test files to JavaScript   |
| `clean`                   | Removes `.dist` folder                         |
| `dev:test`                | Runs Jest in watch mode (for debugging)        |
