---
type: feature
spec: full-plan
status: done
created: 2026-08-29
completed: 2026-08-29
---

# Write down the drizzle boundary, close the authoring-surface gaps

## Problem

The slim recorders cover columns, tables, `extraConfig` constraints, enums, schemas,
sequences, policies and roles. Three things drizzle can do are still missing or
half-done, nowhere in the repo says which side of the line a given drizzle feature
belongs on, and the skill that owns the decision is named after an architecture we
no longer have. Investigated 2026-08-29 against drizzle-orm 0.45.2 (our pinned
version, `packages/*/manifests/*.manifest.json`).

1. **Views** are skipped outright in all three dialect manifests ("views are
   query-layer in v1"). That is only half true, and the half that is false is the
   half users need: a view's row type is exactly the kind of type the slim packages
   exist to propagate.
2. **Row level security** is ~90% done, with five concrete gaps, two of which are
   silent breakage rather than a missing feature.
3. **`pgEnum`** is missing drizzle's object-based overload.
4. There is **no written boundary rule**. The manifests encode it as free-text
   `reason` strings and nothing else, so every future addition re-litigates it, and
   nothing tells a consumer which names come from us and which from `drizzle-orm`.
5. The skill that owns all of this is still called **`drizzle-proxy-migration`**.
   There is no proxy any more (it was replaced by the slim recorders), and the skill
   has no step where the boundary gets decided. Adding a dialect today means an agent
   picks `migrated` vs `skipped` per export on instinct, with two free-text reasons
   as the only guidance.

Relations and extensions were investigated too and need **no code**; the reasoning
is recorded below so it is not re-derived.

## The boundary rule

The slim packages exist for one reason: a table's types must travel through the app
without dragging drizzle's generics with them (measured: 493+1245+673 net type
instantiations through the slim path vs 11504 through the old proxy chain,
`.claude/skills/drizzle-slim-schemas/ARCHITECTURE.md`, post-rename). Everything
follows from that.

Ask two questions of any drizzle feature, in order:

1. **Does drizzle-kit read it off the schema file?** If yes it must be recorded,
   because `toDrizzle()` builds the object drizzle-kit reads, and anything we do not
   record is simply absent from it. This is why constraints, indexes, policies,
   roles and sequences are ours even though they carry no type into the app.
2. **Does the app read a row or payload type from it?** If yes it also needs a model
   (`InferSelectModel` and friends). This is why tables and manual views are ours,
   and why a view needs select-only models.

Everything else is drizzle's, called on the `toDrizzle()` result. A query's types are
paid once, in the file that runs the query, where drizzle is loaded anyway. Wrapping
the query layer would buy no type budget and would cost the optional-peer promise
(`drizzle-orm` is only imported by each dialect's `./drizzle` subpath).

**The one exception, and why it exists.** A view declared from a query builder
(`pgView('v').as(qb => qb.select().from(users))`) answers *yes* to question 1 but
still cannot be ours: its columns come from drizzle's select typing, which is the
exact generic chain the slim design removes. So it is declared with drizzle, in the
schema file, over `toDrizzle()` tables. The manual-column form
(`pgView('v', {...cols}).as(sql\`...\`)`) exists precisely so a view you want typed
in your app can stay slim. State this exception explicitly wherever the rule is
written; it is the only place the rule bends.

**Where this text lives, once.** `packages/drizzle-orm/CLAUDE.md` is the canonical
home: it auto-loads whenever anyone works inside the drizzle packages, contributors
and agents alike. The dialect CLAUDE.md files and the skill's boundary pass both
point at it. Do not copy the rule into a third place.

## The import map

Derived mechanically from the manifests: `status: migrated` means ours,
`status: skipped, reason: db/query layer` means drizzle's.

| What | Import from | Why |
|---|---|---|
| Column builders (`varchar`, `uuid`, `vector`, `geometry`, ...) | `@mionjs/drizzle-orm-<dialect>-core` | schema, and the app reads their types |
| Table factories (`pgTable`, `pgTableCreator`, `pgSchema`, `tableFromType`) | `@mionjs/drizzle-orm-<dialect>-core` | schema + models |
| Constraints and indexes (`index`, `uniqueIndex`, `unique`, `primaryKey`, `foreignKey`, `check`) | `@mionjs/drizzle-orm-<dialect>-core` | drizzle-kit reads them; no type |
| RLS (`pgPolicy`, `pgRole`, `.enableRLS()`) | `@mionjs/drizzle-orm-pg-core` | drizzle-kit reads them; no type |
| Enums and sequences (`pgEnum`, `pgSequence`) | `@mionjs/drizzle-orm-<dialect>-core` | drizzle-kit reads them; enums carry a literal union |
| Views with explicit columns (`pgView(name, cols)`, `pgMaterializedView`) | `@mionjs/drizzle-orm-<dialect>-core` **(this todo)** | schema + the app reads the row type |
| `sql` template, `InferSelectModel` / `InferInsertModel` / `InferUpdateModel`, `refineTableType` | `@mionjs/drizzle-orm` | dialect-agnostic shared surface |
| `toDrizzle` | `@mionjs/drizzle-orm-<dialect>-core/drizzle` | the one module that imports drizzle |
| Views built from a query (`pgView(name).as(qb => ...)`) | `drizzle-orm/<dialect>-core` | needs drizzle's select typing (the exception above) |
| Relations (`relations`) | `drizzle-orm` | query layer only; emits no SQL |
| Operators, aggregates, set ops (`eq`, `and`, `count`, `union`, `l2Distance`, ...) | `drizzle-orm` | query layer |
| Config readers (`getTableConfig`, `getViewConfig`, `isPgEnum`, ...) | `drizzle-orm/<dialect>-core` | query layer, works on the `toDrizzle()` result |
| Provider helpers (`crudPolicy` from `drizzle-orm/neon`, roles from `drizzle-orm/supabase`) | `drizzle-orm/<provider>` | separate module entrypoints; pass the results straight into `extraConfig` (see step 2.5) |
| Extensions (pgvector, PostGIS) | nothing to import | drizzle has no extension declaration API at all |

## Plan

### 1. Views, manual-column form, all three dialects

**Core, new `packages/drizzle-orm/src/view.ts`:**

- `rtViewKey` symbol beside `rtTableKey` (`src/recorder.ts:22`).
- `RtViewRecorder`: holds `name`, the columns record, the pre-terminal chain calls,
  and the terminal (`as` with an `RtSql`, or `existing`). `.as()` / `.existing()`
  return the slim view object (columns as own properties + meta under `rtViewKey`),
  exactly as `createRtTable` does (`src/table.ts:67`).
- `materializeRtView(view, context)`: build every column via `toDrizzleColumn`, call
  `ns[fn](name, columnBuilders)`, replay the chain, then the terminal. Memoized on
  the view, same shape as `materializeRtTable` (`src/table.ts:98`).
- Extend the `setResolveRecorded` resolver (`src/table.ts:116`) and `resolveColumn`
  so a column owned by a view resolves through `materializeRtView`. A view's own
  `sql` template references its own columns, so this is load-bearing.
- Reuse `RtColumnRecorder` unchanged. `createRtTable`'s "column already used in
  another table" guard must cover views too.

**Core models (`src/models.ts:52`):** SHIPPED DIFFERENTLY, and better. The plan
was to widen `InferSelectModel` to `AnyRtTable | AnyRtView`. Measured, that
conditional cost +14 net instantiations on step 1 and +18 on step 2 of the type
budget, on EVERY declared table, whether or not the program has a view.

Drizzle itself splits the two names (`InferSelectModel` for tables,
`InferSelectViewModel` for views), so matching drizzle turned out to be both
free and more faithful: views got their own `InferSelectViewModel`,
`InferSelectModel` stayed table-only, and the budget was untouched. All three
table models now reject a view, which is stricter than the plan asked for.

**Per dialect:**

- pg (`packages/drizzle-orm-pg-core/src/`): `pgView(name, cols)` and
  `pgMaterializedView(name, cols)`, with `.with()`, and for materialized also
  `.using()`, `.tablespace()`, `.withNoData()`, then `.as(sql)` / `.existing()`.
- mysql: `mysqlView(name, cols)` with `.algorithm()`, `.sqlSecurity()`,
  `.withCheckOption()`, then `.as(sql)` / `.existing()`.
- sqlite: `sqliteView(name, cols)` plus its `view` alias; `.as(sql)` / `.existing()`
  only, no chain methods.
- `pgSchema` (`packages/drizzle-orm-pg-core/src/table.ts:190`) gains `view` and
  `materializedView`, matching drizzle's `PgSchema`.
- **The single-argument overload must fail loudly, not be absent.** Declare
  `pgView(name: string): never` with a `@deprecated`-style doc line naming the
  reason and the two ways out (declare it with drizzle, or give explicit columns).
  A silently missing overload sends users to a confusing "expected 2 arguments".

**`toDrizzle` (`packages/drizzle-orm-pg-core/src/drizzle.ts:89`):** add a view
overload returning `ToDrizzleView<V>`, synthesized the same way `ToDrizzleTable`
is (`drizzle.ts:64`), `PgViewWithSelection<Name, Existing, {[K]: PgColumn<SynthConfig<...>>}>`.
Add the `rtViewKey` branch to the runtime dispatch (`drizzle.ts:94`).

**Manifests:** flipped `pgView`, `pgMaterializedView`, `mysqlView`, `sqliteView`,
`view` from `skipped` to `migrated`; `pnpm rtx core drizzle-manifest --check` is
green.

### 2. Row level security, five gaps

1. **`.enableRLS()` on the slim table.** Record a flag on the table runtime; replay
   as `dzTable.enableRLS()` after `buildTable` in `materializeRtTable`
   (`src/table.ts:98`). Mirror drizzle's return type
   (`Omit<PgTableWithColumns<T>, 'enableRLS'>`) so it cannot be called twice.
2. **`pgPolicy(...).link(table)`.** Add `link` to `RtEntryRecorder`
   (`src/recorder.ts:244`). A linked policy sits outside any `extraConfig`, so
   nothing materializes it today: give it a materialization path and accept it in
   `toDrizzle` alongside the `rtValueKey` handles.
3. **`pgRole(...).existing()`.** `pgRole` (`helpers.ts:85`) currently returns a bare
   `{name}` handle with no methods. Without `.existing()`, drizzle-kit tries to
   CREATE a role that already exists.
4. **Extend `completeness.spec.ts:111`** with the `PgPolicy`, `PgRole`, and the new
   view builder prototypes. Gaps 2 and 3 slipped through precisely because that spec
   only covers column, index, unique and foreign-key builders.
5. **Pass through non-recorder entries.** This line throws on any real drizzle policy
   object (what `crudPolicy` from `drizzle-orm/neon` returns), because it has no
   `toDrizzleEntry`:

   ```ts
   // packages/drizzle-orm/src/table.ts:106
   runtime.extraConfig!(table as never).map((entry) => entry.toDrizzleEntry(context, {table, columns: dzExtraColumns}))
   ```

   Pass an entry that is not an `RtEntryRecorder` straight through. One line, and it
   makes every neon and supabase helper usable without us mirroring any of them.
   Widen the `PgExtraConfigFn` return type to admit them.

### 3. `pgEnum` object overload

Drizzle has two; we have one (`helpers.ts:115`):

```ts
export declare function pgEnum<E extends Record<string, string>>(enumName: string, enumObj: NonArray<E>): PgEnumObject<E>;
```

Runtime already worked (values pass through `RtValueRecorder`); only the typing
was missing. Added the overload, the `PgEnumObject` data type, and a matching
`toDrizzle` overload (the last one was not in the plan: without it the object
form had no way to materialize, which the typecheck caught).

### 4. The CLAUDE.md files

Four files. **Really small**, the boundary table and the import map from this doc,
plus two short code blocks. No prose walkthroughs.

- `packages/drizzle-orm/CLAUDE.md`, the one shared file. Carries the two-question
  boundary rule (with the qb-view exception), the import map table, and one
  ~6-line example showing a slim table, `toDrizzle`, and a drizzle query side by
  side. Target: under 40 lines.
- `packages/drizzle-orm-pg-core/CLAUDE.md`, `-mysql-core`, `-sqlite-core`, one line
  pointing at the core file, then only what is dialect-specific: which helpers this
  dialect has that the others do not (RLS and policies are pg-only; `algorithm` /
  `lock` / `sqlSecurity` are mysql-only; sqlite has neither), and the dialect's own
  `toDrizzle` subpath. Target: under 12 lines each.

Rationale for the split (asked and settled): the rule must live in exactly one
place or it drifts; nested CLAUDE.md files auto-load per directory, so a dialect
file that repeats the table costs context on every dialect edit for no new
information.

### 5. Rename the skill and give it a boundary pass

**Rename** `.claude/skills/drizzle-proxy-migration/` to
`.claude/skills/drizzle-slim-schemas/`. There is no proxy left in the design; the
code, ARCHITECTURE.md and the specs all say "slim" already, so this is the name
making the rest of the repo consistent rather than a new coinage. Update the
frontmatter `name`, the `# heading`, and every reference (`git grep
drizzle-proxy-migration`, ~20 hits): 4 package `src/index.ts` comments, 2
`packages/drizzle-orm/src/*.ts` comments, `packages/type-budget/test/modelPipeline.compile.test.ts`,
4 strings in `ts-go-runtypes/cmd/gen-drizzle-manifest/` (`main.go:11`,
`manifest.go:16`, `:388`, `:467`), the 4 committed manifest `$comment` fields
(regenerate, do not hand-edit: `manifest.go:16` is what writes them), and the 5
`docs/done/` specs that cite the old path.

**New section in SKILL.md: the boundary pass.** Runs BEFORE any authoring, i.e.
between steps 2 and 3 of `## The loop`. It has three parts.

1. **The rule, by reference.** Point at `packages/drizzle-orm/CLAUDE.md` for the two
   questions and the query-builder-view exception. Do not restate it.
2. **A fixed reason vocabulary**, replacing today's two free-text standing reasons.
   Each `skipped` entry must carry exactly one of these, because each names which
   question it failed:
   - `query layer: call drizzle on the toDrizzle() result`, drizzle-kit never reads
     it off the schema file, and no app type comes from it.
   - `needs drizzle's select typing: declare with drizzle over toDrizzle() tables` -
     the query-builder-view exception, and the only reason allowed to skip something
     drizzle-kit does read.
   - `class or constant; passes through via export *`, generator-owned, never
     hand-written.
   And the standing hard rule, already in the skill: every `column` entry ends
   `migrated`.
3. **The precedent table, then ask.** For each pending entry, read the sibling
   dialects' committed manifests and show what they decided for the same export, or
   for its dialect-prefixed analogue (`mysqlView` ↔ `pgView` ↔ `sqliteView`). Present
   the grouped list (proposed decision, reason, sibling precedent) with
   **AskUserQuestion**, and get confirmation before writing any recorder. No Go
   change needed: the manifests are committed JSON.

   The default answer is "same as the siblings", and for a new dialect that will
   cover nearly every entry. The pass exists for the handful that have no
   precedent, which is exactly where a wrong call is expensive: a feature the app
   reads a type from, skipped by mistake, is not something a later manifest
   regeneration will ever flag.

**`## Adding a dialect package`** gains this as its explicit step 0, with a sentence
saying the boundary pass is not optional and the sibling decisions are the starting
point, not the answer.

## Tests

Mirroring the existing safety net (`ARCHITECTURE.md` → "The safety net"):

- **Equality matrix**, per dialect `index.spec.ts`: `getViewConfig(toDrizzle(slimView))`
  deep-equals the hand-written drizzle view, for the `.as(sql)` form, the
  `.existing()` form, and (pg) a materialized view with the full chain. Same for a
  table with `.enableRLS()`, a linked policy, and an existing role, via
  `getTableConfig`.
- **Type pins** (`type-pins.stub.ts` + `typeTables.spec.ts`): `InferSelectModel` of a
  view equals the hand-written row type; `InferInsertModel` of a view does not
  compile; the `pgEnum` object overload infers the same union as the tuple form.
- **Completeness** (`completeness.spec.ts`): the four new prototypes, per gap 2.4.
- **Manifest coverage** (`manifest-coverage.spec.ts`): the newly migrated view
  entries are callable exports; nothing pending.
- **Drizzle-free pin** (`packages/type-budget/.../drizzleFreeAuthoring.test.ts`): the
  view authoring surface must compile with `drizzle-orm` unresolvable.
  Non-negotiable: it is the optional-peer promise.
- **Type budget:** re-run the slim lane. Views add a second `ToDrizzle*` synthesis
  path; if it costs materially more than the table one, say so in the report rather
  than absorbing it silently.
- **Marker rule:** any test touching `tableFromType` / `toDrizzle<T>()` needs both
  `getRunTypeId` call shapes as paired tests (`ts-go-runtypes/CLAUDE.md`).

## Fuzzing

`tableEquality.fuzz.spec.ts` (pg, 120 random tables per run) is the natural home.
Extend the generator to emit a random manual view over a generated table and assert
the same `getViewConfig` equality oracle. Cheap: the oracle already exists.

## Docs

- `container/website/sites/mion/content/03.drizzle-orm/`, a new page for views
  (manual form, the models they give you, and the one-line reason the query-builder
  form stays on drizzle). Follow the Website docs style in `CLAUDE.md`: plain
  language, no dashes chaining clauses, `<code-import>` over hand-written fences.
- `00.drizzle-overview.md:60` already says "everything on the query side works on
  the `toDrizzle` result as usual", extend that sentence to name views and
  relations explicitly.
- New examples under `packages/examples/src/` for the `<code-import>` blocks, so the
  root `typecheck` catches drift.

## Out of scope

- **Query-builder views.** Cannot be slim, by the exception above. Documented, not built.
- **Relations.** Pure query layer: drizzle's own docs state they do not affect the
  database schema and create no foreign keys. `relations(table, ...)` wants real
  drizzle tables, so it naturally sits after `toDrizzle()`. (The drizzle docs
  site describes a newer `defineRelations`; our pinned 0.45.2 exports
  `relations` only, verified against the installed package.) Note for later: we
  already record `.references()` and `foreignKey({...})`, so mion can derive
  table-to-table links from the slim table with no relations DSL. Build a reader over
  those recorded foreign keys only when a concrete mion feature needs it; do not
  mirror drizzle's relations DSL.
- **Extensions.** Drizzle has no extension declaration API. Extensions surface as
  column types (`vector`, `halfvec`, `sparsevec`, `bit`, `geometry`, all already
  migrated) and index operators (`.using('hnsw', t.embedding.op('vector_l2_ops'))` -
  `using` and `op` already recorded). `extensionsFilters` is drizzle-kit config, not
  schema. Nothing to build; the import map row is the whole deliverable.
- **Mirroring `crudPolicy` or the supabase helpers.** Gap 2.5 makes them work as-is.
- **The deprecated object-returning `extraConfig` form.** Drizzle marks it deprecated.

## Done when

- Manual views work on all three dialects, materialize equal to hand-written drizzle
  views, and give a select-only model; the query-builder form fails with a message
  naming the way out.
- All five RLS gaps closed, with the completeness spec extended so the next drizzle
  version cannot reopen them silently.
- `pgEnum`'s object overload types the same union as the tuple form.
- `pnpm rtx core drizzle-manifest --check`, `pnpm test`, `pnpm run lint` green.
- Four CLAUDE.md files exist, within their line targets, and the import map in the
  core one matches the manifests.
- The skill is `drizzle-slim-schemas`, `git grep drizzle-proxy-migration` is empty,
  and its boundary pass is a required step that ends in a confirmed decision list.
- Website has a views page; the overview names views and relations.


## What shipped (2026-08-29)

Everything above, in six commits on `claude/drizzle-schema-gaps-g6gprd`.

- The skill is `drizzle-slim-schemas` with a mandatory boundary pass; `git grep
  drizzle-proxy-migration` is empty.
- Four CLAUDE.md files: the core one carries the rule and the import map (39
  lines), the three dialect ones carry only what differs (17-18 lines each,
  slightly over the 12-line target because each keeps a short example).
- All five RLS gaps closed, plus the `pgEnum` object overload.
- Manual-column views on pg, mysql and sqlite, with `InferSelectViewModel`,
  schema-scoped views on `pgSchema`/`mysqlSchema`, and a loud failure on the
  query-builder form.
- Tests: equality matrices per dialect, view model pins in all three type-pins
  stubs, the completeness spec extended to the policy / role / table / view
  builders (each probe verified non-vacuous), the drizzle-free pin extended to
  views + RLS, and the pg fuzz suite now builds a random view per iteration
  (negative-controlled).
- Docs: a views page plus a compilable example, and the overview now names
  views and relations explicitly.

Gate: `pnpm run test:ci` 1020 tests green, `pnpm run lint` exit 0,
`pnpm run typecheck:test` clean, `go -C ts-go-runtypes test ./internal/...` green,
`pnpm rtx core drizzle-manifest --check` green, type budget unchanged.

Relations and extensions shipped as DECISIONS, not code, exactly as the Out of
scope section describes. Nothing was left out.
