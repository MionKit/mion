# drizzle-e2e — drizzle's own suites, against real databases (podman)

Runs the tests Drizzle ORM already trusts — its own integration suites —
translated onto the slim `@mionjs/drizzle-orm-*` packages and executed against a
real postgres, mysql and sqlite, plus the two Cloudflare storage drivers. It is
the only thing in this repository that proves a `toDrizzle()` table works against
a database rather than against another type: every other drizzle test compares a
materialized table with a hand-written drizzle one, which proves the structure
matches and nothing more.

```bash
pnpm rtx release drizzle-e2e                  # every lane
pnpm rtx release drizzle-e2e --dialect pg     # one
pnpm rtx release drizzle-e2e --keep           # leave the container up to poke at
pnpm rtx release drizzle-e2e --skip-types     # builders road only, while iterating
pnpm rtx core drizzle-translate --to-types    # both translations alone: no container, no database
```

## The verdict is a comparison, not a pass

Each suite runs THREE times, each in its own database, from one schema:

```
CONTROL  drizzle's own code                      the baseline every run answers to
WORK     drizzle-migrate onto the slim builders  the builders road
TYPES    WORK + `convert --to type`              the pure-type road
```

The lane passes when every test's outcome is identical on all three, and when
the three trees typecheck with the same errors. The type-road tree runs through
the devtools build transform, which is the only place `tableFromType<T>()` (a
marker call) resolves, so that run also proves the marker to resolver to bridge
chain a consumer's build performs.

That distinction matters. "The suite is green" is the wrong bar, because drizzle's
own suite is not green against every driver — better-sqlite3 rejects an async
transaction callback, and the migrator test reads migration files this lane does
not vendor. Those fail whatever we do. What the lane can honestly assert is that
the translation changed nothing, and comparing the two runs asserts exactly that
with no skip list, no hand-kept exceptions and no judgement calls.

The extra passes over drizzle's own numbers are the addendum (below), which only
exists in the two translated trees.

## What each run does

1. Installs the packages UNDER TEST from a throwaway in-container verdaccio, so
   the lane exercises the packed tarballs rather than the workspace sources. The
   tarballs are rebuilt and repacked whenever a package OR the Go resolver
   changed since they were made, so the lane always describes the tree you are
   on rather than an older one. `--pack` forces that anyway.
   `@ts-runtypes/bin` is what carries the translator in: it resolves its linux
   `@ts-runtypes/binary-<arch>` optional dependency exactly as a consumer's would.
2. Stages the pinned suites, sha256-verified on the host against
   `drizzle-suites.pin.json` and mounted read-only. Nothing is fetched in here.
3. Translates them with `ts-runtypes drizzle-migrate`.
4. Converts that tree again with `ts-runtypes convert --to type`, after the
   runner and the addendum are in place so their builders convert too.
5. Runs all three trees, each against its own database, then compares.
6. Typechecks all three and compares those too.
7. Crosses both reports against the manifests: every `migrated` entry must have
   been exercised by a test that actually passed, on both roads. The type road's
   gate keys on the manifest's `typeAlias`; a refusal excuses a miss only when
   the converter itself reported it, so a refusal class cannot quietly grow.

## Five lanes, four images

| Lane | What it proves | Image |
| --- | --- | --- |
| `pg` | the pg package against real postgres | `mion-drizzle-pg` |
| `mysql` | the mysql package against real MySQL | `mion-drizzle-mysql` |
| `sqlite` | the sqlite package against a sqlite file | `mion-drizzle-sqlite` |
| `d1` | the SAME sqlite tables through `drizzle-orm/d1` | `mion-drizzle-cloudflare` |
| `durable` | the SAME sqlite tables through `drizzle-orm/durable-sqlite`, inside a real Durable Object | `mion-drizzle-cloudflare` |

The DATABASE image is the base — `postgres:17-trixie`, `mysql:8.4`, and plain
`node:26-trixie` for sqlite and cloudflare — with Node added from the official
tarball. Drizzle's suites are written against real postgres and real MySQL, and
Debian ships MariaDB, so starting from the database's own image is what makes them
real. The sqlite and cloudflare images are far lighter than the other two, which
is the payoff for several images rather than one.

**The two Cloudflare lanes are DRIVERS, not dialects.** Neither `drizzle-orm/d1`
nor `drizzle-orm/durable-sqlite` exports a column builder: both take tables
declared with `drizzle-orm/sqlite-core`, which `@mionjs/drizzle-orm-sqlite-core`
already wraps. So they install the sqlite package, run drizzle's own sqlite
suites, and change only how those suites reach storage. They also leave the
manifest coverage to the `sqlite` lane that owns it, and say so in their output
rather than printing a green line they did not earn. They share one image because
a second would be a byte-for-byte copy.

No docker-in-docker, and for the Cloudflare lanes no database server at all:
miniflare ships workerd, and workerd provides both the D1 binding and the Durable
Object SQL storage. `pg-common.ts` ships a `createDockerDB()` helper, but every
runner prefers `PG_CONNECTION_STRING` / `MYSQL_CONNECTION_STRING` /
`SQLITE_DB_PATH` / `RT_DRIZZLE_MINIFLARE_DIR` when set, so pointing at the
container's own storage bypasses it.

### Whatever harness the suite came with

Our translation happens at the drizzle TABLE level, so the test framework a suite
chose is beside the point, and no lane reshapes a suite to fit a harness we
prefer. What every lane must produce is a **comparable result** from each of the
three trees.

`durable` is where that stops being a slogan. Drizzle does not write that suite as
tests at all: `tests/sqlite/durable-objects/index.ts` is a worker, a Durable
Object class whose every method is one test plus a fetch handler that calls them
in order. The lane runs exactly that, on workerd, and only replaces the DRIVING
handler so every method's outcome is recorded instead of the run stopping at the
first throw ([shared/runners/durable-worker.mjs](shared/runners/durable-worker.mjs)).
The method list is read out of drizzle's own handler, never hand-kept. The result
is written in the same report shape the vitest lanes produce, so the comparison,
the summary and the logs do not care which harness ran.

Deps-only images, like the others here: only `_deps/`, the shared workspace policy
and the verdaccio assets are baked. Everything in `shared/` is bind-mounted at run
time, so editing a runner never invalidates an install layer. Bump a dependency by
editing `<image>/_deps/package.json`, then
`pnpm rtx container build-image drizzle-<image>` and `pnpm rtx container push`.

## What is in here

| Path | What it is |
| --- | --- |
| `shared/run-suite.mjs` | the whole lane, inside the container |
| `shared/runners/` | our thin per-lane runners (drizzle's carry migrator tests and a cache suite we do not vendor) |
| `shared/runners/durable-worker.mjs` | the `durable` lane's harness: bundles drizzle's Durable Objects worker, runs it on workerd, writes the report |
| `shared/runners/durable-entry.ts` | the worker entry bundled with that suite; replaces only the driving fetch handler |
| `shared/addendum/` | our own CRUD tests for the builders drizzle's suites never touch, so the coverage gate can be satisfied honestly |
| `shared/stubs/` | the one file the vendored subset references but does not carry |
| `shared/baseline.mjs` | the translated-vs-control comparison, for the tests and for the typecheck |
| `shared/vitest.types.config.ts` | the type-road tree's config: the same knobs plus the devtools plugin |
| `shared/registry/` | verdaccio config + the serve script |
| `<image>/_deps/` | that image's baked dependency set |
