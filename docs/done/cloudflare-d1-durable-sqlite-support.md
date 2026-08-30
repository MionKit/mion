---
type: feature
spec: guidelines
status: done
created: 2026-08-27
---

# Cloudflare D1 and Durable Objects support for the drizzle sqlite package

## Intent

Support the Cloudflare storage drivers with the drizzle integration: D1 (`drizzle-orm/d1`) and Durable Objects SQLite (`drizzle-orm/durable-sqlite`). Users on Cloudflare should get the same story as everywhere else: declare tables with our sqlite builders, refine them, and have validation/serialization/mocking generated from the derived models, with the mion platform-cloudflare adapter serving the routes.

## Direction

- UPDATE (2026-08-28, docs/done/drizzle-slim-builders.md): tables are now slim recorders, so the driver lanes below pass `toDrizzle(table)` (from the sqlite package's ./drizzle subpath) to `drizzle(env.DB)` / the durable storage instead of the table object itself.
- PREMISE (verified 2026-08-27 against drizzle-orm 0.45.2): `drizzle-orm/d1` and `drizzle-orm/durable-sqlite` are DRIVER modules only (driver/session/migrator; `DrizzleD1Database extends BaseSQLiteDatabase` from sqlite-core). They export NO column builders. Tables for both are declared with `drizzle-orm/sqlite-core`, which `@mionjs/drizzle-orm-sqlite-core` already wraps. So this needs NO new proxy package, NO drizzle-dialects.json row, and NO manifest work - the deliverable is verification, pins, examples and docs, not a new dialect.
- Verify + pin that a table built with our sqlite builders (and refined with refineTableType) type-checks and runs against BOTH drivers: `drizzle(env.DB)` from `drizzle-orm/d1` and the durable-sqlite `drizzle(this.ctx.storage)` inside a Durable Object. The interesting risk is our retyped columns flowing through the drivers' query builders (select/insert/update inference over the stamped data types).
- Runtime lane: `miniflare` is already a root devDependency (platform-cloudflare tests run on it) and supports D1 and Durable Object bindings - a spec in `packages/platform-cloudflare` exercising a mion route backed by a real D1 (and ideally a Durable Object) through our table is the natural pin, mirroring the shape of `packages/client/src/drizzleModels.e2e.spec.ts` (validation before handler, Dates revived over the wire).
- Examples + docs: a Cloudflare section or note on the mion site's drizzle pages (declare with @mionjs/drizzle-orm-sqlite-core, connect with drizzle-orm/d1 or durable-sqlite; the sqlite package covers both) plus a compilable example under `packages/examples/src/` if the example can compile without Cloudflare ambient types leaking into the examples program - otherwise a hand-written fence is acceptable there.
- Note for the implementer: sqlite integer timestamp columns map to Date models, so the D1 lane should include a Date round-trip; and check drizzle's documented D1 batch/session limits do not change how our derived models are used (they should not - models are type-level).
- The implementer plans the details: miniflare binding setup, whether the Durable Object lane is feasible in vitest or belongs in the cloudflare platform's existing test harness, and the docs placement.

## Done when

A test proves a proxy-built (and refined) sqlite table works through the D1 driver (type-level and at runtime under miniflare, Date round-trip included), the Durable Objects path is covered or explicitly documented as type-verified only, and the website's drizzle docs say how Cloudflare users connect (sqlite package + d1/durable-sqlite driver).

## Plan and outcome (shipped 2026-08-30)

The premise held: `drizzle-orm/d1` and `drizzle-orm/durable-sqlite` export a
driver, a session and a migrator, and no column builders. So no new package, no
`drizzle-dialects.json` row and no manifest work. This shipped as the **driver
lane** path of the [drizzle-slim-schemas skill](../../.claude/skills/drizzle-slim-schemas/SKILL.md),
which was rewritten first so the work had a checklist to follow rather than the
other way round.

### What shipped, wider than the Done-when asked

The Done-when allowed the Durable Objects path to be "type-verified only". It is
not: it runs, on drizzle's own suite, against a real Durable Object.

1. **The skill first.** `.claude/skills/drizzle-slim-schemas/SKILL.md` gained a
   dialect-vs-driver split with the full touchpoint checklist, a section saying
   both translate roads (`drizzle-migrate` and `convert --to type`) are part of a
   dialect, a section on adding a GHCR e2e image, and the rule that a PR touching
   this area carries the `drizzle-e2e` label.
2. **Two new e2e lanes**, `d1` and `durable`, sharing one new image
   `mion-drizzle-cloudflare` (`node:26-trixie`; miniflare ships workerd, so
   neither lane needs a database server). Both run drizzle's OWN suites, both
   compare control vs builders vs types.
   - `d1` runs `sqlite-common.ts` through `drizzle-orm/d1`.
   - `durable` runs drizzle's `durable-objects/index.ts`, which is not a vitest
     suite at all but a worker. It is run as a worker, and only the DRIVING fetch
     handler is replaced so every method's outcome is recorded instead of the run
     stopping at the first throw.
   Measured on the host: 136 D1 tests with zero outcome differences, and 98
   Durable Objects methods with the same 96 passed / 2 failed on all three trees.
3. **Type pins** in `packages/drizzle-orm-sqlite-core/src/type-pins.stub.ts`: a
   refined slim table keeps its stamped types through both drivers' select,
   insert and update inference, and the Date column stays a Date.
4. **A runtime spec**, `packages/platform-cloudflare/src/cloudflareStorage.workers.spec.ts`:
   mion routes on workerd backed by a real D1 and a real Durable Object, with the
   refined bound rejected before the handler runs and a Date round trip on both.
   It needed a second test-server bundle in MODULES format, because the existing
   cloudflare bundle is a service worker and a service worker cannot export the
   Durable Object class.
5. **Docs and examples**: a new
   [Cloudflare D1 and Durable Objects](../../container/website/sites/mion/content/03.drizzle-orm/08.cloudflare-storage.md)
   page, a pointer from the platform page and the drizzle overview, and two
   compiling examples under `packages/examples/src/drizzle/`.

### Two decisions worth recording

- **No `@cloudflare/workers-types` in the workspace.** The bindings are declared
  locally, the posture `packages/platform-cloudflare/src/types.ts` already took.
  The container's own `_deps` may carry it, since container deps never enter the
  workspace lockfile.
- **The driver lanes claim no manifest coverage.** The `sqlite` lane owns the
  sqlite and root manifests and already proves every migrated builder against a
  real database; re-running that here would assert the same thing twice. The
  waiver is an explicit field in each lane's spec with its reason, printed at run
  time, not a silent skip.

### Found and fixed along the way

`@ts-runtypes/devtools/esbuild` claimed files its transform ignores. esbuild has
no transform phase, so unplugin emulates one with an onLoad hook, and an onLoad
that fires reads the file and guesses a loader from the extension. Adding the
plugin to a build that loads a `.sql` file as text therefore made esbuild parse
SQL as JavaScript. Fixed with a `transformInclude` filter, pinned by
`packages/ts-runtypes-devtools/test/esbuild-nonjs-loader.test.ts`. The same
commit corrected `vitest.types.config.ts`, which was passing `tsConfig` where the
plugin reads `tsconfig` and had been silently ignored.

### Still owed

The `mion-drizzle-cloudflare` image is defined but **not published**: this
session's egress blocks Docker Hub, so the base image could not even be pulled.
Someone with GHCR credentials must run
`pnpm rtx container build-image drizzle-cloudflare` then
`pnpm rtx container push drizzle-cloudflare` before the CI lane can pass, and the
PR needs the `drizzle-e2e` label after that.
