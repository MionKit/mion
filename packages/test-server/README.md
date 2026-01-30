# @mionkit/test-server

> ⚠️ **Internal Package** - This package is private and not published to npm.

Centralized test server utilities for mion packages. Provides pre-configured test servers with Deepkit type reflection for testing client-server communication.

## Why This Package Exists

Multiple packages in the mion monorepo need to test client-server communication:

- `@mionkit/client` - Tests client functionality against a real server
- `@mionkit/test-publish` - Verifies built packages work correctly

Instead of duplicating server code in each package, this package provides:

- **Pre-built test servers** - JSON and binary serialization servers
- **Server management utilities** - Start/stop servers, health checks, port management
- **Jest integration** - Convenient `beforeAll`/`afterAll` hooks
- **Shared types** - API types for type-safe client testing

## Usage

### Basic Usage

```typescript
import {initClient} from '@mionkit/client';
import {createTestServerLinkedFns, TEST_PORT_MAPPING, JEST_TIMEOUT_CONSTANTS} from '@mionkit/test-server';
import type {TestServerApi} from '@mionkit/test-server';

describe('My Tests', () => {
  const serverLinkedFns = createTestServerLinkedFns({
    port: TEST_PORT_MAPPING.client,
    serverType: 'json',
  });

  beforeAll(serverLinkedFns.beforeAll, JEST_TIMEOUT_CONSTANTS.BEFORE_ALL_TIMEOUT);
  afterAll(serverLinkedFns.afterAll, JEST_TIMEOUT_CONSTANTS.AFTER_ALL_TIMEOUT);

  it('should call a route', async () => {
    const {routes} = initClient<TestServerApi>({
      baseURL: serverLinkedFns.getBaseURL(),
    });
    const [result] = await routes.sayHello({name: 'John', surname: 'Doe'}).call();
    expect(result).toBe('Hello John Doe');
  });
});
```

### Binary Serialization Tests

```typescript
import type {BinaryTestServerApi} from '@mionkit/test-server';

const serverLinkedFns = createTestServerLinkedFns({
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

1. **During development** - Uses `ts-node` with `tsconfig-paths` to run TypeScript source files directly
2. **With built packages** - Can also run from compiled `.dist` files

The `TestServerManager` class:

- Spawns a separate Node.js process for the server
- Uses health checks to detect when server is ready
- Handles graceful shutdown with SIGTERM/SIGKILL
- Manages port conflicts automatically

## Building

```bash
npm run build -w @mionkit/test-server
```

This compiles the servers with Deepkit type reflection, producing output in `.dist/`.

## Important Notes

- **Private package** - Not published to npm, only used internally
- **Requires reflection** - Server files must be compiled with type metadata
- **Port management** - Always use `TEST_PORT_MAPPING` to avoid conflicts
- **Timeout constants** - Use `JEST_TIMEOUT_CONSTANTS` for reliable test setup
