# @mionjs/test-server

> ⚠️ **Internal Package** - This package is private and not published to npm.

Centralized test server utilities for mion packages. Provides pre-configured test servers with runtime type reflection for testing client-server communication.

## Why This Package Exists

Multiple packages in the mion monorepo need to test client-server communication:

- `@mionjs/client` - Tests client functionality against a real server

Instead of duplicating server code in each package, this package provides:

- **Pre-built test servers** - JSON and binary serialization servers
- **Server management utilities** - Start/stop servers, health checks, port management
- **Jest integration** - Convenient `beforeAll`/`afterAll` hooks
- **Shared types** - API types for type-safe client testing

## Usage

### Basic Usage

```typescript
import {initClient} from '@mionjs/client';
import {createTestServerMiddleFns, TEST_PORT_MAPPING, JEST_TIMEOUT_CONSTANTS} from '@mionjs/test-server';
import type {TestServerApi} from '@mionjs/test-server';

describe('My Tests', () => {
  const serverMiddleFns = createTestServerMiddleFns({
    port: TEST_PORT_MAPPING.client,
    serverType: 'json',
  });

  beforeAll(serverMiddleFns.beforeAll, JEST_TIMEOUT_CONSTANTS.BEFORE_ALL_TIMEOUT);
  afterAll(serverMiddleFns.afterAll, JEST_TIMEOUT_CONSTANTS.AFTER_ALL_TIMEOUT);

  it('should call a route', async () => {
    const {routes} = initClient<TestServerApi>({
      baseURL: serverMiddleFns.getBaseURL(),
    });
    const [result] = await routes.sayHello({name: 'John', surname: 'Doe'}).call();
    expect(result).toBe('Hello John Doe');
  });
});
```

### Binary Serialization Tests

```typescript
import type {BinaryTestServerApi} from '@mionjs/test-server';

const serverMiddleFns = createTestServerMiddleFns({
  port: TEST_PORT_MAPPING.binarySerialization,
  serverType: 'binary',
});
```

## Port Mapping

To avoid port conflicts when running tests in parallel, use the predefined port mapping:

```typescript
export const TEST_PORT_MAPPING = {
  // Client package tests
  client: 8086,
  clientMethodsMetadata: 8087,
  friendlyErrors: 8088,
  binarySerialization: 8089,
};
```

## Exported Types

| Type                  | Description                              |
| --------------------- | ---------------------------------------- |
| `TestServerApi`       | API type for JSON serialization server   |
| `BinaryTestServerApi` | API type for binary serialization server |
| `TestServerOptions`   | Configuration options for server startup |
| `TestServerManager`   | Class for managing server lifecycle      |

## How It Works

1. **During development** - Runs TypeScript source files directly through Vite
2. **With built packages** - Can also run from compiled `.dist` files

The `TestServerManager` class:

- Spawns a separate Node.js process for the server
- Uses health checks to detect when server is ready
- Handles graceful shutdown with SIGTERM/SIGKILL
- Manages port conflicts automatically

## Building

```bash
pnpm --filter @mionjs/test-server run build
```

`build` produces the two standalone runtime bundles under `build/` — `test-server-edge.js` and
`test-server-cloudflare.js` — used by the platform-vercel and platform-cloudflare specs. Both are
GENERATED and gitignored: the specs rebuild their own in a vitest `globalSetup`, so they cannot go
stale. Both set `emitMode: 'both'`, which edge runtimes require.

Both build scripts run `buildTestBundle.ts` rather than `vite build` directly, so its
`assertBuiltFromSource` guard — the bundle must inline sibling packages from source, never from a
sibling `.dist` — covers every path that produces a bundle, not only the `globalSetup` one.

The `.dist/` ESM library build is a separate, opt-in script:

```bash
pnpm --filter @mionjs/test-server run build:lib
```

It is NOT part of `build`, because it consumes `packages/client/.mion/batches.json` — an
artifact only the client's **test** run writes — which made `pnpm run build` fail on a clean clone.
Nothing consumes `.dist`: every workspace config resolves this package through its `source` export
condition. Run `build:lib` only after the client suite has run.

## Important Notes

- **Private package** - Not published to npm, only used internally
- **Requires reflection** - Server files must be compiled with type metadata
- **Port management** - Always use `TEST_PORT_MAPPING` to avoid conflicts
- **Timeout constants** - Use `JEST_TIMEOUT_CONSTANTS` for reliable test setup
