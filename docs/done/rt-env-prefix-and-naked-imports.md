---
type: chore
spec: guidelines
status: done
created: 2026-09-01
completed: 2026-09-01
---

# Retire the RT_ env prefix, and unify the docs import style

## What shipped

`RT_` was the last visible piece of the old ts-runtypes identity: 112 registered
vars across 1,079 sites. It is gone. The docs half turned out to be a different
job than the todo assumed, and settled on one consistent import style instead.

Four commits:

1. `docs(drizzle)` — the slim-package namespace moved `DB` → `DZ`.
2. `chore(env)` — `RT_BENCH_*` → `RT_VALIDATION_BENCH_*`, clearing the collision
   that blocked the prefix move.
3. `chore(migration)` — `keep:retired-env` so the rename skips `TS_RUNTYPES_BIN`.
4. `chore(env)` — the prefix itself, `RT_*` → `MION_*`.

## The env rename

**Target prefix: `MION_`.** The alternative, `MION_RT_`, would have kept the two
families distinguishable for free, but at the cost of a second prefix nobody
would remember the rule for.

**The collision that forced a preliminary commit.** Ten `RT_BENCH_*` knobs would
have landed on names the mion HTTP **server** benchmarks (`MION_BENCH_*`) already
own: `ENGINE`, `IMAGE`, `QUICK`, `DOCDATA`, `REMOTE_IMAGE`, `MOUNT_OPTS`,
`RUN_NETWORK`, `RESULTS_DIR`, `HOST_CPU`, `USE_LOCAL`. The two families drive
different images and never share a container, so collapsing them would have been
a silent protocol break, not a tidy-up. The whole family moved to
`RT_VALIDATION_BENCH_*` first, in its own commit, so the prefix phase could then
run as ONE substitution with no exceptions.

**Driven by the migration tooling**, which already had the phase wired:
`migration/lib/transforms.mjs` maps the `env-var` transform onto
`targets.envPrefix`, which was sitting empty. Setting it to `["mion"]` and
running `node migration/apply.mjs --phase env-var` rewrote 1072 sites in 146
files. No hand-editing, and the dry run is the review.

**Two tokens the `env-var` rule could not tell apart by shape**, both now claimed
by a `keep:*` rule above it, each with a paired assertion in
`migration/test/rules.test.mjs`:

- `TS_RUNTYPES_BIN` (`keep:retired-env`) — retired, read by nothing, and alive
  only so the vite plugin can warn a user who still sets it. Renaming it would
  have moved the warning off the string people actually have in their shell.
- `RT_TYPE_TAG` / `RT_IDS_TAG` (`keep:tag-const`) — not env vars at all, but
  generated TS constants holding the `@rtType` / `@rtIds` JSDoc tags. Their name
  tracks the tag they carry, not the env namespace.

**Five vars keep answering to their old name, and warn once.** These are read out
of a CONSUMER's environment, where neither end is ours to move: someone's shell
profile, CI job, or `.env` still says `RT_BIN`. Dropping the old name there would
silently stop honouring a value they deliberately set, and for a binary-path
override that means running a DIFFERENT binary than asked for, whose version
folds into every typeId.

| var | legacy name | read at |
| --- | --- | --- |
| `MION_BIN` | `RT_BIN` | `packages/ts-runtypes-bin/lib/index.js` |
| `MION_CACHE_DIR` | `RT_CACHE_DIR` | `ts-go-runtypes/cmd/mion/main.go` |
| `MION_JS_RUNTIME` | `RT_JS_RUNTIME` | `ts-go-runtypes/internal/jsengine/sidecar.go` |
| `MION_LINT_PRESPAWN` | `RT_LINT_PRESPAWN` | `src/eslint/session.ts`, `src/eslint/lint-worker.ts` |
| `MION_NEXT_DEBUG` | `RT_NEXT_DEBUG` | `src/next/broker.ts` |

The fallback is one helper per side rather than a branch per call site:
`packages/ts-runtypes-devtools/src/envCompat.ts` and
`ts-go-runtypes/internal/envcompat/`. Both prefer the current name when it is
SET, even set empty: an empty value is a deliberate choice for the vars that read
one (`MION_CACHE_DIR=""` forces the cache off), so it must not fall through to a
stale legacy value. The alias is documented on each registry row rather than
given a row of its own, so there stays exactly one entry per knob.

**Nine env vars were read but missing from the REGISTRY**, which is the single
source of truth this whole rename runs on, so leaving them out would have left
that source of truth wrong: `MION_ALLOW_UNVERIFIED_PUBLISH`, `MION_UPDATE_GOLDEN`
(dev), and `MION_BINARY`, `MION_PROBE_PATH`, `MION_PROBE_BODY`,
`MION_CFGFAIL_DIR`, `MION_UPDATEFAIL_CHILD`, `MION_UPDATEFAIL_PATH` (internal).
All registered; the two dev rows mirrored into `.env.sample`.

**Unchanged:** `GENERATE_ROUTER_SPEC` (a public `@mionjs/router` runtime knob),
`PG_CONNECTION_STRING` / `MYSQL_CONNECTION_STRING` / `SQLITE_DB_PATH` (drizzle
owned), `NPM_TOKEN` / `GHCR_*` / `CLOUDFLARE_*` / `CI` (external names).

## The docs half: naked imports were investigated and REJECTED

The todo asked for naked imports (`import {pgTable, serial}`) in the docs
examples. That was measured against the tree and dropped. Recording why, so the
question is not reopened from scratch.

**There is no technical payoff.** Neither claimed cost survives contact:

- **Type-checking: identical.** The repo already measures this. The instantiation
  harness at `packages/run-types/test/types/builderCostHarness.ts` uses namespace
  imports as its baseline and records that resolving them "costs 0 net on its
  own". TypeScript loads the module's full declaration set either way; the import
  is a fixed per-file cost, and what scales is the per-call marginal.
- **Runtime with no bundler: identical.** ESM has no partial evaluation.
  `import {object} from 'pkg/builders'` evaluates the whole module and everything
  it re-exports, exactly like `import * as RT`. What changes the load is which
  SUBPATH you import from, never the style.
- **Bundling: a wash.** Rollup and esbuild shake a namespace import fine while
  the namespace object stays static.

**The drizzle worry points at the subpath, not the style.** The recorder entry
`@mionjs/drizzle-orm-pg-core` never imports drizzle-orm. The `./drizzle` subpath
does, and pulls ALL of `drizzle-orm/pg-core` unavoidably, because `toDrizzle`
replays recorded calls by name:

```ts
// packages/drizzle-orm-pg-core/src/drizzle.ts:19,49
import * as dzPg from 'drizzle-orm/pg-core';
  ns: dzPg as unknown as DrizzleContext['ns'],
```

That namespace escapes into the replay context, so no bundler can shake it, and
no import style in a doc example makes it better or worse.

**The cost, on the other hand, is real.** Seven public format types shadow
TypeScript globals when imported by name (`String`, `Number`, `BigInt`, `Date`,
`Lowercase`, `Uppercase`, `Capitalize`), so `import type {Date}` silently hijacks
the global `Date`. The examples use them 29 times. Renaming them is a public API
break that also reaches the Go emitter's `TypeAlias` table
(`ts-go-runtypes/internal/schemadoc/leaf.go:56-66`) and its goldens. And
`TF.`-style namespaces are what make every format discoverable by autocomplete,
which is exactly why the playground presets are written that way.

**So the real problem was inconsistency, not style**, and the cheaper fix was to
unify on the namespace form the runtypes docs already used.

## `DB` → `DZ`

`DB` collided with the conventional `db` connection variable sitting in the same
examples (`db.select()` next to `DB.pgTable`). `DZ` matches the uppercase `RT` /
`TF` namespaces, and stays distinct from the LOWERCASE `dzPg` / `dzMy` /
`dzSqlite` locals that mean real drizzle-orm across 11 spec files: the case plus
the dialect suffix separate them, and the two conventions read as complementary
rather than competing.

- 133 sites across 18 example files and the drizzle overview page. Prose "DB
  defaults" and the Cloudflare `Env.DB` binding are NOT the namespace and were
  left alone.
- One outlier folded in: `drizzle-schema-file-example.ts` imported `pgView` by
  name from a module it already had a namespace for.
- One local renamed so no file can hold both spellings: `completeness.spec.ts`
  bound bare `dz` to real drizzle; it is `dzPg` now, like its three siblings.
- No Go source change. The converter reads the alias from the file being
  converted (`drizzle.go:438`), so there is no hardcoded `"DB"` anywhere.

## Also fixed, found on the way

- `migration/shards/02-ts-core.json` deleted. Its area maps to
  `packages/ts-runtypes/`, which the phase-2 directory move retired, so
  `scan.mjs` had stopped emitting it and the file was 650 dead decision rows.

## Verification

`pnpm run check:env` green (registry ↔ `.env.sample` mirror). `pnpm run lint`
(oxlint + eslint + typecheck) green. All 21 vitest projects green via
`pnpm run test:ci`. `go -C ts-go-runtypes test ./internal/... ./cmd/...` green.
`pnpm run check-types-examples` green, which is what proves the doc examples
still compile.

## Not done here

The container lanes (`pnpm rtx release e2e`, the website build, the benchmark
lanes) were NOT run: this environment has no GHCR egress to pull the images. They
are where a half-renamed boundary var would show, so they are the thing to watch
on CI. Every boundary var moved on both ends within a single commit, which is the
property those lanes check.
