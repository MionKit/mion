# @mionkit/server-pure-functions

Vite plugin for client-defined, server-executed pure mapping functions in mion.

## Overview

This plugin enables **client-defined, server-executed pure mapping functions** that are:

- ✅ Deterministic and side-effect free
- ✅ Serializable via AST extraction at build time
- ✅ Secure — no runtime function transfer, only hash IDs over the wire
- ✅ Compatible with monorepos — client and server in separate packages
- ✅ Built on top of the existing mion pure functions infrastructure
- ✅ TypeScript support — types are automatically stripped from function bodies
- ✅ Anonymous functions supported — bodyHash is the unique identifier

## Usage

### Client Side

The client just uses `pureServerFn()` to wrap pure functions. No Vite plugin needed on the client side — the function returns metadata (`bodyHash`, optional `fnName`) that gets sent to the server.

```ts
import {pureServerFn} from '@mionkit/server-pure-functions';

// Named function (fnName is optional, for debugging)
export const mapUsersToPreferences = pureServerFn(function mapUsersToPreferences(users: User[]) {
  return users.map((u: User) => ({userId: u.id, prefs: u.preferences}));
});

// Anonymous arrow function (also supported!)
export const addOne = pureServerFn((x: number) => x + 1);

// The returned reference contains:
// - bodyHash: 'abc12345' (hash of the function body - the unique identifier)
// - fnName: 'mapUsersToPreferences' (optional, for debugging)
```

### Vite Config (Server Only)

The server plugin scans the client's TypeScript source directly — no client build required:

```ts
import {pureFunctionsPlugin} from '@mionkit/server-pure-functions';

export default defineConfig({
  plugins: [
    pureFunctionsPlugin({
      clientSrcPath: '../web-client/src', // Path to client source directory
    }),
  ],
});
```

The plugin:

1. Scans the client source directory for `pureServerFn()` calls
2. Extracts function bodies and strips TypeScript types
3. Provides a virtual module `virtual:mion-pure-functions` with the function implementations
4. Validates function purity at build time

## Pure Function Rules

- Named or anonymous functions allowed (bodyHash is the identifier)
- No closure variables
- No external imports except other `pureServerFn` references
- No side effects (fetch, setTimeout, etc.)
- No `this`, `eval`, `require`, dynamic `import()`
- The `'pureServerFn'` namespace is assigned automatically

## TypeScript Support

TypeScript type annotations are fully supported in pure functions. The plugin uses TypeScript's compiler API to strip types from function bodies at extraction time, producing valid JavaScript for runtime execution.

```ts
// This works! Types are stripped automatically
export const filterByThreshold = pureServerFn(function filterByThreshold(items: Item[]) {
  const threshold: number = 10;
  return items.filter((item: Item) => item.value > threshold);
});
```

## Security

No runtime function transfer. Only `bodyHash` IDs are transmitted over the wire. The server validates that the hash matches the pre-registered function.

## Function Identification

Functions are identified by their `bodyHash`, which is computed from:

- The namespace (`'pureServerFn'`)
- The normalized function body (whitespace collapsed)

This means:

- Same function body = same hash (regardless of function name)
- Different function body = different hash
- Anonymous functions work just as well as named functions

## Plugin Options

```ts
interface PureFunctionsPluginOptions {
  /** Path to the client package source directory containing pureServerFn() calls */
  clientSrcPath: string;
  /** Glob patterns for files to scan. Defaults to ['**/*.ts', '**/*.tsx'] */
  include?: string[];
  /** Glob patterns for files to exclude from scanning */
  exclude?: string[];
}
```
