# Drizzle context type cost

Measured with TypeScript 6, real slim schema packages, Drizzle proxy databases and `initClient`. Each route explicitly returns `Promise<User[]>` and takes a slim `User['id']` parameter. The server fixture and client root are checked for TypeScript errors. Client counts check only the client root, as when consumers import the server API type. These are type instantiations, not wall-clock timings.

The table uses `Api = typeof api` after `mion.initRoutes(definitions)`. JSON files also contain direct `PublicApi<typeof definitions>` counts.

| Context | PostgreSQL | MySQL | SQLite |
| --- | ---: | ---: | ---: |
| empty context | 1,962 | 1,991 | 2,004 |
| small context | 2,028 | 2,057 | 2,070 |
| database context | 14,378 | 14,691 | 14,035 |
| unused database context | 14,378 | 14,691 | 14,035 |
| light handler context | 14,370 | 14,683 | 14,027 |
| opaque database context | 2,010 | 2,039 | 2,052 |
| written database context | 14,370 | 14,683 | 14,027 |

A typed database in the factory increases client cost even when the handler never uses it. A light handler context type also leaves the cost high. Typing the factory database as `unknown` returns near baseline, but requires a server-side cast for database access.

Route definitions retain their router-options type, including `contextDataFactory`. `PublicApi` reads those options and the handler type to derive public metadata. Removing context from the callable signature does not fully isolate the factory type from client checking.

The diagnostic checks written return types and non-context parameters. Context parameters are exempt, so this factory cost is not covered. Slim public returns alone do not guarantee low client cost in this pattern.

Reproduce with `pnpm exec vitest run --project drizzle-example-app packages/private-drizzle-example-app/test/contextTypeBoundary.compile.test.ts`.
