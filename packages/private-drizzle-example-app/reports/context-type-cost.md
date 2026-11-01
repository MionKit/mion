# Drizzle context type cost

Measured with TypeScript 6, real slim schema packages, Drizzle proxy databases and `initClient`. Each route explicitly returns `Promise<User[]>` and takes a slim `User['id']` parameter. The server fixture and client root are checked for TypeScript errors. Client counts check only the client root, as when consumers import the server API type. These are type instantiations, not wall-clock timings.

The table uses `Api = typeof api` after `mion.initRoutes(definitions)`. JSON files also contain direct `PublicApi<typeof definitions>` counts. Every `sharedDataFactory` has a written return type; the empty context has no factory.

| Context | PostgreSQL | MySQL | SQLite |
| --- | ---: | ---: | ---: |
| empty context | 2,031 | 2,060 | 2,073 |
| small context | 2,118 | 2,147 | 2,160 |
| database context | 14,456 | 14,769 | 14,113 |
| unused database context | 14,456 | 14,769 | 14,113 |
| light handler context | 14,449 | 14,762 | 14,106 |
| opaque database context | 2,118 | 2,147 | 2,160 |
| written database context | 14,449 | 14,762 | 14,106 |

A database typed in the factory's return increases client cost even when the handler never uses it. A light handler context type also leaves the cost high. Writing the factory's return as `{db: unknown}` returns near baseline, but requires a server-side cast for database access. An inferred `() => ({db})` return keeps the cost high: the client infers the whole options literal to type the router, so it computes the database type from the body.

The cost is the factory call's own inference, paid once per client program, not per route.

The diagnostic checks written return types and non-context parameters. Context parameters are exempt, so this factory cost is not covered. Slim public returns alone do not guarantee low client cost in this pattern.

Reproduce with `pnpm exec vitest run --project drizzle-example-app packages/private-drizzle-example-app/test/contextTypeBoundary.compile.test.ts`.
