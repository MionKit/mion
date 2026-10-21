# drizzle-type-cost

Reruns the measurements behind `drizzle-mixed-types` and
[the report](../../packages/private-drizzle-example-app/reports/drizzle-type-cost.md).
Manual only: no CI lane, test run or lint touches it.

Question: a client imports one slim model. Does it pay for `toDrizzle`, relations and queries
that live in the same file?

## Run

Needs a set-up host (Go, the typescript-go submodule, `node_modules`).

```bash
node tools/drizzle-type-cost/setup.mjs     # ~1 min: builds tsgo, mion .d.ts, fixtures into .work/
node tools/drizzle-type-cost/measure.mjs   # ~5 min: prints every table as markdown
REPS=3 node tools/drizzle-type-cost/measure.mjs   # fewer timing repeats (default 5)
```

`.work/` is git-ignored and rebuilt from scratch by every `setup.mjs`.

## What it builds

- **Example app fixtures** from `packages/private-drizzle-example-app/src/db/`, each dialect and form:
  - `split`: `schema.ts` (slim) + `db.ts` (`toDrizzle`, relations, `drizzle()`).
  - `mixed`: both in one file. `mixedQueries`: plus a select, a join, a relational query, a view select.
  - `*Dts`: the same modules as emitted `.d.ts`, like a published package or built project reference.
  - Clients: `typeOnly` (`import type {User, Post, NewUser}`) and `valueImport` (`import {users}`).
- **Scaling fixtures**: 1 to 60 generated pg tables, one `toDrizzle` and one query each.
- **Mion packages as `.d.ts`** (emitted by tsgo), so the check sees them like an installed package.
  Bundles resolve the package sources instead.

## What it measures

| Number | How |
| --- | --- |
| Editor cost | TypeScript API, semantic diagnostics of the client file only (the checker is lazy). |
| Full check cost | TypeScript API, whole program, like `tsc --noEmit`. |
| `tsc` / `tsgo` time, memory | `--extendedDiagnostics`, median of `REPS` runs. |
| Bundle | esbuild, minified, browser, value-import client. |

Every fixture must compile with zero errors: a type error stops the run.
