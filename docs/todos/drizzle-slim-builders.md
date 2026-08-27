---
type: feature
spec: full-plan
status: ready
created: 2026-08-27
---

# Slim drizzle-free column builders with lazy toDrizzle materialization

## Problem

The dialect packages (@mionjs/drizzle-orm-*-core) stamp runtype formats onto drizzle's own
builder types and derive models through drizzle's generics. The type-budget lane comparison
([packages/type-budget/reports/lane-comparison.md](../../packages/type-budget/reports/lane-comparison.md),
TS 6.0.3 / drizzle-orm 0.45.2) prices that: declaring the model through the proxy chain costs
12186 net type instantiations (5025 drizzle table + 2114 proxy stamps + 4365 refineTableType +
682 Infer* models) against about 700 for a hand-written flat row. Worse, the model aliases stay
unresolved: every route file, the client, the Go resolver and every npm consumer reading the
emitted d.ts re-runs the whole drizzle chain (consumer lane budget 4205), and the chain already
broke declaration emit once
([docs/done/dts-emit-fails-router-over-proxy-columns.md](../done/dts-emit-fails-router-over-proxy-columns.md)).

Goal: the packages neither expose drizzle types nor send them downstream. Drizzle becomes a
runtime target materialized on demand, not the type-level foundation.

## Architecture

**One authoring surface, drizzle-shaped, all ours.** A table is written exactly as a drizzle
table is written: same function names, same call params, same modifier chains, same extraConfig,
same helpers, no separate layers and nothing imported from drizzle. Every authoring function
comes from our packages and returns a slim object recording the call instead of running drizzle.
The record lives at RUNTIME only, as internal functions on the object itself: each `RtColumn`
carries its own `toDrizzleColumn(dz)` materializer (set by the column function that created it,
taking the drizzle module namespace as an argument so the builder modules never import drizzle)
plus the replay closures its chained modifiers appended. None of this is embedded in the type
system. The wrapped surface:

- the column builders (all manifest `column` entries, todays passthrough boolean/json/etc
  included) and their full modifier chains;
- the table factories, mirroring BOTH drizzle overloads (columns as an object, or as a callback
  receiving the column helpers) plus the extraConfig callback
  (`(self) => ExtraConfigValue[]`), which receives slim columns and uses our helpers;
- the constraint and index helpers, which in drizzle are chainable config builders exactly like
  columns (`index('n').on(t.col).where(...)`), so the same record-and-replay applies: for pg
  that is check, foreignKey, index, uniqueIndex, unique, primaryKey, pgEnum, pgSchema,
  pgSequence, pgPolicy, pgRole, pgTableCreator, customType; the mysql/sqlite equivalents mirror
  their manifests. pgView/pgMaterializedView are reviewed per entry: recorded with a query
  callback deferred to materialization, or skipped v1 with a written manifest reason;
- the `sql` tagged template (an authoring export of the ROOT drizzle-orm module, used in
  defaults, checks, generated columns): recorded with its embedded values, slim column refs
  included, and rebuilt with drizzle's real `sql` at materialization.

**Lazy materialization.** `toDrizzle(table)` is the single module that imports drizzle: it
traverses the graph (columns, extraConfig entries, enum/schema/sequence factories, sql
templates, `references(() => users.id)` slim-column refs, resolved lazily the way drizzle's own
references callback already is) and calls each element's internal materializer, passing the
drizzle namespace in; the materializer restores the full drizzle state from the recorded call
params and replays the modifiers 1:1. Results are memoized per table. Drizzle's builders are
config objects whose modifiers mutate and return `this`
(`node_modules/drizzle-orm/column-builder.js`), so replaying a recorded mod list reproduces the
exact table a hand-written drizzle file would build. Drizzle-kit schema files export
`toDrizzle(users)` (plus whatever enum/schema export drizzle-kit discovery needs, verified by
the implementer).

**Slim types.** The builder chain carries only what models need:
`RtColumn<Data, {notNull; hasDefault; insertExcluded}>`, with the format mapping (varchar
length -> Str<{maxLength: L}>, integer -> Int32, timestamp mode -> RTDate/StringDateTime, enum
tuples -> literal unions, ...) moving from the current $Type stamps into the builders' own
return types. Modifiers that do not affect models return the same type untouched; constraint
helpers cost nothing model-side. `primaryKey()` implies notNull, mirroring drizzle. No other
column metadata enters the type system: `toDrizzleColumn` restores everything from the recorded
params. (If some metadata ever must ride a type, runtype format params already support that;
explicitly not needed here.)

**Models, flat.** `InferSelect/InferInsert/InferUpdate<typeof table>` become cheap mapped types
over the slim columns, delegating to the existing
[packages/ts-runtypes/src/modelTypes.ts](../../packages/ts-runtypes/src/modelTypes.ts)
utilities: `RowOf<T>` puts nullable columns as optional props, then `SelectModel<RowOf<T>>`,
`InsertModel<RowOf<T>, GeneratedKeys, DefaultedKeys>`, `UpdateModel<...>`. Drizzle's rules are
mirrored from `node_modules/drizzle-orm/operations.d.ts`: select gives `Data | null` for
nullable columns; insert requires notNull-without-default, makes defaulted (including
$defaultFn) optional, and excludes generatedAlwaysAs plus identity-always columns.

**Refine, flat.** `refineTableType` keeps its name, runtime identity and compile-error contract
(non-refinable column -> `never`) but merges params over slim columns with the existing
`MergeFormat`/`RefinableParamsOf` from
[packages/ts-runtypes/src/formats/refineFormat.ts](../../packages/ts-runtypes/src/formats/refineFormat.ts).
Measured cost of that shape: ~380 instead of 4365.

**Package layout: resurrect the root package.** The dialect-agnostic machinery (the RtColumn /
RtTable / constraint-recorder cores with their materializer slots, the traversal engine, the sql
recorder, RowOf + Infer* wiring, refine core) lives in a shared root package mirroring drizzle's
own root module, in the spirit of the pre-split `@mionjs/drizzle` removed in commit 0837417 -
suggested name `@mionjs/drizzle-orm`. The three dialect packages keep the dialect surface
(column functions, table factory, constraint helpers, each wrapper's own materializer). The root
package joins the same drizzle versionLine and the dialect packages depend on it by
minor-aligned peer range plus workspace devDependency, the exact shape already used for
`@ts-runtypes/core` ([scripts/lib/drizzle-line.mjs](../../scripts/lib/drizzle-line.mjs) rules
apply). This replaces the byte-identical-files parity hack for the shared core; the parity spec
shrinks to the dialect-specific files that still mirror each other.

**Where drizzle types are paid.** Only `toDrizzle`'s return type references drizzle, lazily and
only in db files. Two candidate typings, the spike decides: (a) synthesize structural
`PgColumn` configs from slim state (cheap; the current refine.ts already proved drizzle accepts
rebuilt structural configs), or (b) replay drizzle's own builder generics (guaranteed
compatible, costs what raw drizzle costs, still confined to db files). Seed with (a); fall back
to (b) if drizzle's query builder rejects synthesized configs. Since authoring imports nothing
from drizzle, `drizzle-orm` becomes an OPTIONAL peer (peerDependenciesMeta): the root and
dialect packages typecheck and produce models/validators with drizzle-orm absent, and only the
module holding `toDrizzle` imports it.

## Plan

Stages, one PR:

1. **Spike + measurement rails.** Hand-write a minimal pg slim core (3 columns, one index)
   inside [packages/type-budget/](../../packages/type-budget/) lanes only; add a "db query
   through toDrizzle" step; measure toDrizzle typings (a) vs (b); seed the new budgets. Kill
   criteria: if db.select/insert typing cannot work against synthesized configs, switch to (b)
   before building the full surface.
2. **Root package.** New `@mionjs/drizzle-orm` (workspace + versionLine wiring, publish rules,
   e2e pack list): RtColumn/RtTable/constraint cores with materializer slots, chain core,
   traversal engine, sql recorder, RowOf + Infer* + refine cores.
3. **pg package.** All 32 `column` entries as slim builders, the modifier chain (notNull,
   default, $default, defaultNow, primaryKey, unique, array, $type, references,
   generatedAlwaysAs, identity), the authoring helpers listed above as recorders, extraConfig
   recording, and each wrapper's own `toDrizzleColumn`/materializer. Replaces
   [src/index.ts](../../packages/drizzle-orm-pg-core/src/index.ts) and
   [src/refine.ts](../../packages/drizzle-orm-pg-core/src/refine.ts); the export-star
   passthrough is removed; stubs-formats-mappings rewritten for the slim shapes.
4. **mysql + sqlite.** Mirror stage 3 (26 + 6 column entries; autoincrement, onUpdateNow,
   sqlite integer timestamp modes; their authoring helpers).
5. **Manifest tooling + skill.** `gen-drizzle-manifest` keys on local exported names, which the
   wrappers keep, so the generator largely survives
   ([ts-go-runtypes/cmd/gen-drizzle-manifest/gen.go](../../ts-go-runtypes/cmd/gen-drizzle-manifest/gen.go)).
   Policy changes: every `column` entry must be migrated; `function` entries split into
   migrated authoring recorders vs skipped query/util functions with the reason "db layer, use
   drizzle on the toDrizzle result" (alias, union/intersect/except family, getTableConfig,
   view configs, withReplicas, extractUsedTable, array parse/make utils, is* guards);
   `passthrough` classes/constants skip as internal. Add a config row (or sibling mechanism) so
   the root `drizzle-orm` module's authoring exports (`sql`, ...) get the same coverage gate.
   The manifest-coverage specs drop the export-star assertions. Rewrite the
   [drizzle-proxy-migration skill](../../.claude/skills/drizzle-proxy-migration/) for authoring
   descriptor recorders instead of $Type stamps.
6. **Repo consumers.** [packages/test-server](../../packages/test-server/), the client
   drizzle e2e spec, [packages/type-budget](../../packages/type-budget/) (the drizzle lane
   becomes the slim lane; declarationEmit.test covers routers over slim tables; consumer d.ts
   lane re-seeded), examples under
   [packages/examples/src/drizzle/](../../packages/examples/src/drizzle/) and _homepage.
7. **Docs.** Rewrite the two pages under
   [container/website/sites/mion/content/03.drizzle-orm/](../../container/website/sites/mion/content/03.drizzle-orm/)
   (overview + column-formats): tables written exactly as drizzle tables from our imports,
   toDrizzle for the db/migration layer, the optional peer. Website style rules apply;
   published READMEs stay thin; CLAUDE.md's package map gains the root package.

## Tests

- **Runtime equality (the load-bearing one).** For every column kind, modifier and authoring
  helper: `toDrizzle(slimTable)` deep-equals the table built with raw drizzle builders
  (drizzle's getTableConfig covers columns, indexes, checks, foreign keys), extending the
  existing byte-identical pin in
  [index.spec.ts](../../packages/drizzle-orm-pg-core/src/index.spec.ts). Include a
  cross-table references case, an enum case and an extraConfig case.
- **Model pins.** Expect/Equal compile pins for select/insert/update over notNull, defaults,
  generated, identity, enums, arrays, $type, refined params; validators via createValidateFn
  as today (both getRunTypeId call shapes where the marker API is touched, per the marker rule).
- **Type budgets.** New slim-lane budgets seeded near the builder lane (roughly 330-400 per
  model step vs 5025/2114/4365 today), the db-query step budget, consumer d.ts lane re-seeded,
  declaration emit asserted `emitSkipped === false` for routers over slim tables.
- **Coverage.** Per dialect, a completeness spec diffs our chain-method set against the drizzle
  builder prototypes at runtime (column AND index/constraint builders), so a drizzle upgrade
  adding a method fails visibly; the manifest gate already catches new exported functions.
- **Drizzle-free root.** A spec compiling the root + a dialect package's authoring surface in a
  program where drizzle-orm does not resolve, pinning the optional-peer promise.
- Go side untouched (formats/sentinel detection unchanged), but run the Go suite anyway.

## Fuzzing

Property test with a trusted oracle: generate random tables (column kinds, modifier chains,
indexes/constraints) per dialect, build the same table through the slim surface + toDrizzle and
through raw drizzle, assert getTableConfig equality. Harness pattern per
[packages/ts-runtypes/test/fuzz/](../../packages/ts-runtypes/test/fuzz/).

## Docs

Stage 7 above; also the sibling
[cloudflare-d1-durable-sqlite-support.md](cloudflare-d1-durable-sqlite-support.md) premise
(tables now materialize through toDrizzle; that todo's direction section needs the one-line
update when this lands).

## Out of scope

- Wrapping drizzle's query/db-side surface (select builders, relations, alias helpers,
  getTableConfig): those operate on the toDrizzle result, which IS a drizzle table.
- Any change to the runtypes format system, the Go resolver, or the mion router/client.
- New dialects or driver-specific work (D1/durable-sqlite stays its own todo).
- Validation semantics: what a format validates does not change, only where the type comes from.

## Done when

Tables are authored exactly as drizzle tables using only our imports (columns, modifiers,
extraConfig, constraints, enums, sql included); the packages export no drizzle types and
typecheck with drizzle-orm absent; `toDrizzle` output is pinned deep-equal to raw drizzle across
the column/modifier/constraint matrix and the fuzz oracle; the type-budget slim lane lands near
the builder-lane numbers with routes/client steps unchanged and the consumer d.ts lane
collapsed; declaration emit stays green; the manifest gate (root module included), parity spec,
full JS + Go suites, examples typecheck and website docs are all updated and green. Breaking
change noted in CHANGELOG.md under the drizzle version line.
