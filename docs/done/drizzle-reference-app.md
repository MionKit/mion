---
type: feature
spec: guidelines
status: done
created: 2026-09-27
---

# A small mion + drizzle reference app, to find the holes

## Intent

The slim drizzle packages cut type-checking cost, and were proven against drizzle's own suites, but nobody had
built an app with them. Build one, end to end, and use it to find where the integration is weak or forces the
user to write types by hand. The first known question: `toDrizzle` dropped plain format tags from query row
types, so a route returning a query result lost its formats.

## What shipped

- **`packages/private-drizzle-app/`** (`@mionjs/drizzle-app`, private), in the normal suite (`drizzle-app`
  vitest project, `mion-rest` batch, a heavy project). No database and nothing new installed: queries run
  through drizzle's own proxy drivers (`pg-proxy`, `mysql-proxy`, `sqlite-proxy`) answered by a fake driver
  that hands back queued raw rows, in the shape a real driver sends them.
  - `src/db/`: the SAME two tables (users, posts) and two views in pg, mysql and sqlite, each three ways, one
    self-contained file per way: `<dialect>.builders.ts` (builder tables), `<dialect>.types.ts` (tables written
    as types) and `<dialect>.drizzle.ts` (plain drizzle). Each exports its tables, drizzle handles and the same
    model names (`User`, `NewUser`, `UserPatch`, `Post`, `NewPost`, `PostPatch`, `AdultUser`, `BusyAuthor`).
  - `src/server/`: the SAME 12 routes in every dialect, three files each. `builders` and `types` write params
    and return types with the slim models; `drizzle` types the params with drizzle's types and leaves every
    return type to drizzle. `test/routeFiles.test.ts` proves the three files are one set of routes: types is
    builders with other imports, drizzle is builders with other imports and the return types removed.
  - `src/client/client.ts`: the consumer, which knows the server only through `AppApi`, with
    `validateServerResponses: true`.
  - `test/fullStack.spec.ts`: client, real HTTP (platform-node), route, fake database and back, for every
    route of every variant in every dialect (120 tests), and the three variants must send the same SQL.
  - `test/type-pins.stub.ts`: builder and type-form tables give every route the same params and answers.
  - `test/schemaForms.spec.ts`: the three files of a dialect build the same drizzle tables (columns, keys,
    foreign keys), as drizzle-kit reads them.
  - `test/cost.compile.test.ts`: per route, the type cost of the server file and of a client file, split into
    params (the route with only its params) and return (the rest: query and return type). Writes
    `reports/drizzle-app.{md,json}`.
- **The format question, decided: `toDrizzle` rows keep their formats.** `SynthConfig` now sets
  `data: ValueOf<P, D>`; `PlainDataOf` is deleted. A queried row IS its slim model (`maxLength`, `UUID`,
  `Int32`, `RTDate` included), so a route can return it with no cast and the client validates it. Cost went
  DOWN about 100 instantiations per query (the stripping step was the cost); the type-budget budgets were
  lowered to lock that in.
- **The drizzle check** (`drizzle-translate` on the host, `run-suite.mjs` in the container) still fails on
  any new type error, except one sitting on an exact-type assertion (`expectTypeOf(x).toEqualTypeOf<T>()`,
  `Expect<Equal<T, U>>`), which it reports apart. Keeping formats adds 16 of those in drizzle's suites (for
  example `{id: number}` against a `PositiveInt` id); the types are right, the assertions expect drizzle's
  plainer types. Rule and tests in `container/drizzle-e2e/shared/baseline.mjs` and
  `packages/devtools/test/drizzle-e2e-lane-contracts.test.ts`.
- **Docs:** "Returning Query Results" in `00.drizzle-overview.md` with
  `packages/private-examples/src/drizzle/drizzle-query-routes-example.ts`, and two lines in `02.views.md`.

## Results

Formats: every slim-model route keeps them, in every dialect and on both table forms, since the change above;
a drizzle-typed route has none (plain drizzle types carry no formats), so its client accepts a 101-character
name. The builders files show what a user writes by hand when a route may not return drizzle types: a
`Pick<User, ...>` per partial select, one model per joined table, `User & {posts: Post[]}` for relations.

Type cost across the 12 routes (`reports/drizzle-app.md` has every route, params and return apart):

| Dialect | Client: drizzle / types / builders | Server: drizzle / types / builders |
| ---- | ----: | ----: |
| pg | 318,915 / 22,871 / 35,882 | 306,759 / 270,242 / 302,440 |
| mysql | 501,419 / 23,328 / 35,842 | 490,188 / 461,733 / 493,755 |
| sqlite | 507,610 / 23,662 / 35,770 | 495,657 / 450,991 / 482,290 |

- Per route, a drizzle-typed client costs 4.8 to 11 times the builders one and 6.5 to 18 times the type-form
  one (1,000 to 3,900 against 18,500 to 21,200).
- Params alone: drizzle's `$inferInsert` costs about 8,500, the type-form model 2,500, the builder model 3,500.
- On the server the three are close (the query dominates); type-form tables are the cheapest.
- The transaction route costs 100,000 (pg) to 288,000 (mysql, sqlite) when measured alone. That is
  drizzle's `transaction` typing on a `db` with a relations schema, and it is paid ONCE per program (on pg about
  85,000 the first time, under 500 for each later transaction), so it is not a per-route cost. A written
  return type keeps it off the client.

## Findings

- **Formats were lost on every query result.** Fixed here (`toDrizzle` keeps them).
- **Inferred return types are the real cost.** A client calling a route whose return type drizzle infers
  re-checks the query: at least 4.8 times the type work of a route typed with the slim models. The MRT001 lint
  rule already asks every route for a return type; the lint-rule todo now carries these numbers.
- **drizzle's `transaction` is the most expensive type in the app**, paid once per program. Nothing to fix
  on our side; a written return type keeps it off the client. The cost test builds each route alone, so its
  transaction row shows that one-time cost.
- **`row as Note` casts** in the Cloudflare storage test server and example existed only to restore
  formats. Removed.
- **Transactions:** drizzle's `pg-proxy` and `mysql-proxy` drivers refuse them, so the transaction route only
  runs on sqlite; on pg and mysql its test asserts the refusal. A drizzle limit, not ours.
- **mysql has no `returning`**, so its insert, update and transaction routes read the row back with a select.
- **Views have no type form**: a type-form schema keeps its views as builders over the type-form tables.
  Works as documented, nothing to fix.
- **A view built from a query builder has no slim model** (DRZ001 keeps it on drizzle), so the slim files write
  its row type by hand (`BusyAuthor = Pick<Post, 'authorId' | 'views'>`); drizzle infers it.
- **A client that imports `AppApi` from server sources loads the server's whole import graph**, drizzle
  included, so "the client program loads no drizzle file" was dropped as a check. What matters is what the
  client pays to check, which the cost test measures.

Changed from the plan: every case runs in all three dialects, not only pg; the package is not in the
drizzle-e2e lane's paths (it runs in the normal JS lane).
