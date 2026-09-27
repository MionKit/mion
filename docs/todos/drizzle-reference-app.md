---
type: feature
spec: guidelines
status: ready
created: 2026-09-27
---

# A small mion + drizzle reference app, to find the holes

## Intent

The slim drizzle packages exist to cut type-checking cost: a table's types travel through the app without
drizzle's generics. They are proven against drizzle's own test suites and the basic models
(`InferSelectModel`, `InferInsertModel`, `InferUpdateModel`), but nobody has built a real app with them. Build
one, small but complete, and use it to find where the integration is weak or forces the user to write types
by hand.

The first known question: `toDrizzle` drops plain format tags from drizzle's query row types on purpose
(`PlainDataOf` in `packages/drizzle-orm/src/types.ts`, used by each dialect's `src/drizzle.ts`), keeping only
nominal brands. A route that returns a query result therefore returns a type without its formats, and the
client and the validators need them. We probably want format info kept, or recoverable from a drizzle return
type, without the user restating the type.

## Direction

The implementer plans the details. What to cover:

- **Home:** a new private package, e.g. `packages/private-drizzle-app/`, run by the normal test suite and the
  root typecheck like `packages/private-test-server/`. It needs its own vitest project, a test batch
  (`scripts/core/test-batches.mjs`) and a `typecheck:test` script.
- **The full path, for every case:** declare the table, query it, return the result from a mion route, call
  it from `@mionjs/client`, and validate it. Check the types at each step and what the client receives.
- **Queries beyond the basic models:** partial selects, joins, aggregates, `returning()`, relations
  (`db.query...`), a view with explicit columns and one built from a query builder (the second stays drizzle,
  see DRZ001), transactions, and a route that returns a mapped or nested shape.
- **Both table forms:** builder tables and tables written as types (`tableFromType`), at least pg; mysql and
  sqlite where the behaviour differs.
- **For each case, record:**
  - whether the returned type keeps its formats, or which it loses;
  - whether the user had to write a type by hand to keep the cost low, or to get formats back;
  - the type-instantiation cost of the file (measure with the type-budget harness,
    `packages/private-type-budget/test/`), next to the same code on plain drizzle.
- **Format loss is the first design question.** Weigh: keep format tags in `toDrizzle`'s row types (and what
  that costs, and whether a migrated schema stays a drop-in); or give a cheap way to recover formats from a
  drizzle return type. Decide with numbers.
- **Every hole found is fixed** in the same PR or split into its own todo; the findings list goes in the done
  spec.
- Related: the todo that adds a lint rule warning when a route returns a drizzle type. Its outcome may depend
  on what this one decides about formats.

## Docs

`container/website/content/01.rpc/04.drizzle-orm/00.drizzle-overview.md`: a new section on returning query
results from a route (what keeps its formats, and the recommended way), plus a line in `02.views.md` if view
rows behave differently. Examples in `packages/private-examples/src/drizzle/`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The app exists, runs in the normal test suite, and covers every case above end to end.
- Each case has a recorded result (formats kept or lost, hand-written types needed, type cost vs plain
  drizzle), kept in the done spec.
- The format-loss question is decided and implemented, with tests on both table forms.
- Every hole found is fixed or filed as its own todo.
- Docs updated; the simplify-docs pass ran on every touched page and the simplify-comments pass on every
  touched source file, each committed on its own.

## Plan (approved 2026-09-27)

### Context

The slim drizzle packages are proven against drizzle's own suites, but nobody built a real app with them.
Known hole: `toDrizzle()` row types drop format tags (`PlainDataOf`, `packages/drizzle-orm/src/types.ts:285`),
so a route returning a query result loses its formats (uuid, maxLength, Int32...). Today every example gets
them back only by a hand annotation (`Promise<User[]>`, `row as Note`). The app finds these holes, the format
question gets decided with numbers, and the outcome decides whether the lint-rule todo still makes sense.

Agreed with the user: a committed private package, **no real database and no new installs**. Queries run
through drizzle's built-in proxy drivers (`drizzle-orm/pg-proxy`, `mysql-proxy`, `sqlite-proxy`) with canned
rows, the same trick `typeTables.spec.ts` already uses. Most questions are type checks anyway.

### 1. The package: `packages/private-drizzle-app/` (`@mionjs/drizzle-app`)

Modelled on `packages/private-test-router-fuzz` (own vitest project + `mionVitePlugin`).

- `package.json`: private, version `0.12.2`, `test`, `typecheck:test: tsc -p tsconfig.json --noEmit`,
  `workspace:*` deps (core, router, client, platform-node, run-types, drizzle-orm*, devtools),
  `drizzle-orm: 0.45.2`. All already in the workspace, nothing new downloaded.
- `tsconfig.json` (`rootDir: "../.."`), `vitest.config.ts` (heavy: 30s timeouts, `vitest-clean-gendir` setup).
- Register: root `vitest.config.ts` projects, `scripts/core/test-batches.mjs` (`mion-rest`),
  `packages/devtools/test/test-batch-contracts.test.ts` (HEAVY), root `tsconfig.json` paths alias,
  root `package.json` `lint:eslint` glob, `scripts/ci/lanes.mjs` drizzle lane prefix, lockfile via install.

Layout:
```
src/schema.slim.pg.ts      builder tables (slim)       + toDrizzle
src/schema.types.pg.ts     tableFromType<T>() tables    + toDrizzle
src/schema.plain.pg.ts     same tables on plain drizzle (cost baseline only)
src/schema.*.sqlite.ts / *.mysql.ts   only the columns that behave differently
src/db.ts                  proxy drivers with canned rows
src/cases/*.ts             one file per case: query fn + route
src/server/app.ts          createMionRouter + routes, export type AppApi
src/server/start.ts        startNodeServer via @mionjs/platform-node (real HTTP)
src/client/client.ts       the consumer: imports ONLY `type AppApi`, initClient, one typed call per route
test/globalSetup.ts        starts the server (same pattern as packages/rpc-client/globalSetup.ts)
test/fullStack.spec.ts     client -> HTTP -> route -> proxy db -> back, per case, with
                           validateServerResponses: true, so a wrong return type fails the response check
test/types.spec.ts         Equal checks at each hop: query result, route return, client result
test/cost.compile.test.ts  instantiation count per case, server file AND client file, slim vs plain drizzle
test/clientIsolation.compile.test.ts  the client program loads no drizzle-orm .d.ts at all
reports/drizzle-app.md     the numbers (committed, like private-type-budget/reports)
```

### The consumer client (full stack)

`src/client/client.ts` is written like a real front end: it never imports the server's code, only its
`AppApi` type, and exports one function per case (`listUsers()`, `userNames()`, `postsWithAuthor()`...).
The tests call those functions, so the path is the real one:

```ts
import type {AppApi} from '../server/app.ts';
const {routes} = initClient<AppApi>({baseURL, validateServerResponses: true});
export const listUsers = () => routes.users.list().call();
```

What the client side proves per case: the result type it sees (formats kept or lost), that drizzle types
never reach it, its own type cost, and that the values it gets back (Dates, bigints) arrive restored.

### 2. Cases (pg builder AND pg types for each; sqlite/mysql where they differ)

select all, partial select, join (left/inner), aggregate (count/sum), `insert().returning()`,
`update().returning()`, relations (`db.query.x.findMany({with})`), view with explicit columns,
view from a query builder (stays drizzle, DRZ001), transaction, mapped/nested return shape.
sqlite: integer timestamp/boolean modes, json text. mysql: no `returning`, `$returningId`.

For each case record: formats kept or lost (server and client), hand-written type needed or not,
cost vs plain drizzle (server file and client file), and whether drizzle types leaked into the client.

### 3. The format question (decided with numbers, then shown to you before building it)

- **A. Keep tags in `toDrizzle` rows**: prototype, then measure cost and rerun
  `pnpm miondevx core drizzle-translate --to-types` to see if a migrated schema stays a drop-in
  (the done spec shows tags once turned three drizzle `Equal` checks into `never`).
- **B. Keep rows plain, recover cheaply**: rows already assign to the models, so annotate with the model
  (`Promise<User[]>`, `Pick<User, 'id' | 'name'>`), plus a small helper type if partial/join shapes need one.

I bring you the numbers and a recommendation, you pick, then I build it with tests on both table forms.

### 4. Holes found

Related ones fixed in this PR, own commit + test (already known: the misleading
`// typed rows, formats intact` comment in `private-examples/src/drizzle/*to-drizzle-example.ts`).
Unrelated ones go to a parallel session via delegate-finding.
The lint-rule todo gets rewritten (or deleted) to match the decision; I ask you which once numbers exist.

### 5. Tests, docs, fuzzing

- Tests: the package's own vitest (runtime + type checks + cost). If `toDrizzle` types change: the dialect
  `type-pins.stub.ts` files and `drizzle-translate` typecheck.
- Docs: new section "Returning Query Results From a Route" in
  `container/website/content/01.rpc/04.drizzle-orm/00.drizzle-overview.md` (after "Using Models in Routes"),
  a line in `02.views.md` if views differ, examples in `packages/private-examples/src/drizzle/`.
- Fuzzing: not a candidate (type questions, no cheap oracle).

### 6. Finish

Gate: `pnpm test`, `pnpm run lint`, `pnpm run format`. Spec amended (proxy drivers instead of a live DB,
findings table) and `git mv` to `docs/done/`. docs-simplifier + comments-simplifier passes, each its own commit.
PR labels: `drizzle-e2e` (if toDrizzle changes), `website`, `pre-publish-e2e` if a public type changes.

### Verification

`pnpm --filter @mionjs/drizzle-app test`, `pnpm run typecheck`, `pnpm run check:test-batches`,
`pnpm run check:typecheck-coverage`, `pnpm exec vitest run repo-contracts test-batch-contracts`.
