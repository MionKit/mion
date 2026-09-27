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
  - `src/db/`: the pg schema as builder tables, the same schema as type-form tables (`tableFromType`), the
    same tables on plain drizzle (cost baseline only), plus sqlite and mysql tables for what they store
    differently.
  - `src/server/`: one mion router, the pg cases twice (`pg.routes.ts` with no return type written,
    `pg.typed.routes.ts` with the return type written from the slim models), sqlite and mysql cases.
  - `src/client/client.ts`: the consumer, which knows the server only through `AppApi`, with
    `validateServerResponses: true`.
  - `test/fullStack.spec.ts`: client, real HTTP (platform-node), route, fake database and back, per case,
    on both pg route styles, plus sqlite and mysql.
  - `test/typeForm.spec.ts`: the type-form tables run the same SQL and give the same rows as builder tables.
  - `test/type-pins.stub.ts`: the client's answer type for every case is the same whether drizzle inferred
    it or it was written by hand; both table forms give the same models.
  - `test/cost.compile.test.ts`: per-case type cost of the server file and of a client file, both route
    styles, over builder, type-form and plain drizzle tables. Writes `reports/drizzle-app.{md,json}`.
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

## Results per case (pg)

Formats: kept in every case, on both table forms, since the change above. Hand-written types: none are needed
to get formats; a return type is still worth writing for cost (MRT001 asks for one anyway). Client cost is
the type work a client file does to call the route (`reports/drizzle-app.md` has server and client, all lanes).

| Case | Formats kept | Type needed by hand | Client cost, inferred / typed (builders) | Typed, plain drizzle |
| ---- | ---- | ---- | ----: | ----: |
| select all | yes | no | 16,587 / 2,575 | 5,070 |
| partial select | yes | no (`Pick<User, ...>`) | 16,337 / 2,691 | 5,182 |
| inner join | yes | no | 18,073 / 3,348 | 8,473 |
| left join | yes | no | 18,788 / 3,281 | 8,406 |
| aggregate (`count`, `avg`, `sql<number>`) | n/a, no format | no | 16,830 / 1,801 | 2,984 |
| `insert().returning()` | yes | no | 19,567 / 3,659 | 8,741 |
| `update().returning({...})` | yes | no | 17,162 / 2,706 | 5,197 |
| relations (`db.query...with`) | yes | no (same fields as `User & {posts: Post[]}`) | 18,643 / 3,539 | 8,676 |
| view, explicit columns | yes | no | 17,624 / 1,736 | 5,608 |
| view from a query builder (DRZ001) | yes | no | 17,907 / 3,156 | 6,628 |
| mapped / nested shape | yes | no | 18,291 / 2,569 | 5,599 |

On the server file, builder and type-form tables both cost less than plain drizzle in every case (type-form
the least). sqlite (integer timestamp and boolean modes, json text, a transaction) and mysql (`$returningId`)
run the same path and keep their formats.

## Findings

- **Formats were lost on every query result.** Fixed here (`toDrizzle` keeps them).
- **Inferred return types are the real cost.** A client calling a route whose return type is inferred from a
  drizzle query re-checks that query: 5 to 9 times the type work of a route typed with the slim models. The
  MRT001 lint rule already asks every route for a return type.
- **Drizzle's `$inferSelect` types in a return annotation cost the client 2 to 3 times the slim models.**
  That is what the lint-rule todo is for; its intent now carries these numbers.
- **`row as Note` casts** in the Cloudflare storage test server and example existed only to restore
  formats. Removed.
- **Transactions:** drizzle's `pg-proxy` and `mysql-proxy` drivers refuse them, so the transaction case runs
  on sqlite. A drizzle limit, not ours.
- **Views have no type form**: a type-form schema keeps its views as builders over the type-form tables.
  Works as documented, nothing to fix.
- **A client that imports `AppApi` from server sources loads the server's whole import graph**, drizzle
  included, so "the client program loads no drizzle file" was dropped as a check. What matters is what the
  client pays to check, which the cost test measures.

Not changed from the plan: the package is not in the drizzle-e2e lane's paths (it runs in the normal JS
lane); relations and transactions tie the "at least pg" cases to pg, sqlite covering the transaction.
