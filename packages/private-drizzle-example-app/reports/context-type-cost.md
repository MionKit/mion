# Drizzle context type cost

Measured with TypeScript 6, real slim schema packages, Drizzle proxy databases and `initClient`. Each route explicitly returns `Promise<User[]>` and takes a slim `User['id']` parameter. The server fixture and client root are checked for TypeScript errors. Client counts check only the client root, as when consumers import the server API type. These are type instantiations, not wall-clock timings.

The table uses `Api = typeof api` after `mion.initRoutes(definitions)`. JSON files also contain direct `PublicApi<typeof definitions>` counts. Every router sharing data is created with `customMionRouter<{shared: X}>()`, `X` written by hand; the empty context uses plain `createMionRouter`.

| Context | PostgreSQL | MySQL | SQLite |
| --- | ---: | ---: | ---: |
| empty context | 2,272 | 2,301 | 2,314 |
| small context | 2,437 | 2,466 | 2,479 |
| database context | 14,787 | 15,100 | 14,444 |
| unused database context | 14,787 | 15,100 | 14,444 |
| light handler context | 14,783 | 15,096 | 14,440 |
| opaque database context | 2,437 | 2,466 | 2,479 |
| written database context | 14,783 | 15,096 | 14,440 |

A typed database in `shared` increases client cost even when the handler never uses it. A light handler context type also leaves the cost high. Declaring `shared` as `{db: unknown}` and writing the factory return as `{db: unknown}` returns near baseline, but requires a server-side cast for database access. Declaring `shared` alone is not enough: the client resolves the router's type by inferring the whole options literal, so a factory with an inferred `() => ({db})` return still makes it compute the database type.

The cost is the factory call's own inference, paid once per client program, not per route.

The diagnostic checks written return types and non-context parameters. Context parameters are exempt, so this factory cost is not covered. Slim public returns alone do not guarantee low client cost in this pattern.

Reproduce with `pnpm exec vitest run --project drizzle-example-app packages/private-drizzle-example-app/test/contextTypeBoundary.compile.test.ts`.
