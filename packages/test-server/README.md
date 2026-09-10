# @mionjs/test-server

> ⚠️ **Internal Package** - This package is private and not published to npm.

Centralized test server for mion packages. One route tree with runtime type reflection, used by
`@mionjs/client` and the `platform-*` packages to test real client-server calls instead of
duplicating a server in each of them.

## Usage

The package exports the route tree and its types; the tests own the server lifecycle through their
own vitest `globalSetup` (see `packages/client/globalSetup.ts`).

```typescript
import {initClient} from '@mionjs/client';
import type {TestServerApi} from '@mionjs/test-server';

const {routes} = initClient<TestServerApi>({baseURL});
const [result] = await routes.sayHello({name: 'John', surname: 'Doe'}).call();
```

Importing this package never starts a server. Start one from a vitest `globalSetup`, in the same
process as the tests:

```ts
import {startTestServer} from '@mionjs/test-server';

let server;
export async function setup() {
  server = await startTestServer(8086);
}
export async function teardown() {
  await new Promise((done) => server.close(done));
}
```

Set `MION_TEST_SERVER_AUTO_START=true` to start on import instead, which is what the lanes that run
the entry as a program of its own do. `MION_TEST_PORT` picks the default port.

## Route Groups

| Group     | What it covers                                                         |
| --------- | ---------------------------------------------------------------------- |
| default   | The JSON wires, errors, headers, batches, drizzle-backed routes        |
| `compact` | The positional wire, including a middleFn with no `encoder` of its own |

## Exported Types

| Type                                                      | Description                                      |
| --------------------------------------------------------- | ------------------------------------------------ |
| `TestServerApi`                                           | API type of the whole route tree, for the client |
| `SimpleUser`, `ComplexUser`, `NestedData`, `CompactEvent` | Payload shapes the routes use                    |

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

It builds standalone on a clean clone: this package's `vite.config.ts` names `@mionjs/client`'s
tsconfig with `client.tsConfig`, so the build's own resolver reads every `batch([...])` and inline
`inputFrom` mapper out of the client package, generates the batch table and the mapper modules under
this package's `.mion/rpc/`, and imports the table from `src/test-server.ts`. Nothing is read from
the client's tree. It is still NOT part of `build` because nothing consumes `.dist`: every workspace
config resolves this package through its `source` export condition, and the script exists for manual
inspection only.

## Important Notes

- **Private package** - Not published to npm, only used internally
- **Requires reflection** - Server files must be built with the mion vite plugin so the type
  functions are injected
