---
type: feature
spec: guidelines
status: ready
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
