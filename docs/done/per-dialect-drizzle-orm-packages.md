---
type: feature
spec: full-plan
status: done
created: 2026-08-27
---

# Per-dialect drizzle-orm packages with type-level refinement and drizzle-aligned versioning

## Problem

`@mionjs/drizzle` (packages/drizzle, version 0.8.10 on the lockstep train) bundles all three dialects behind subpaths and rides the mion version train, so its version says nothing about which drizzle-orm it supports. It also has no refinement story: no way to declare API constraints stricter than the database column (drizzle-zod's refinements equivalent), and no blessed path from a table to the model types the standard runtypes functions consume.

## Plan

### 1. Three new packages, `@mionjs/drizzle` deleted

Names mirror the drizzle-orm module path (user rule: `drizzle-orm/node-postgres` -> `@mionjs/drizzle-orm-node-postgres`):

- `packages/drizzle-orm-pg-core` -> **@mionjs/drizzle-orm-pg-core** (from `drizzle-orm/pg-core`)
- `packages/drizzle-orm-mysql-core` -> **@mionjs/drizzle-orm-mysql-core**
- `packages/drizzle-orm-sqlite-core` -> **@mionjs/drizzle-orm-sqlite-core**

Keep the `-core` suffix: it is the mechanical mapping (future `singlestore-core`, `pg-proxy`, `node-postgres` never collide), and `-pg` alone would read as the node-postgres driver.

Each package: single root `"."` export (consumer writes `import {pgTable, varchar} from '@mionjs/drizzle-orm-pg-core'`, mirroring `drizzle-orm/pg-core`). `src/index.ts` is the current proxy file (packages/drizzle/src/proxies/pg.ts etc.), plus new `src/refine.ts` (refineTableType + the Infer* type utilities, see section 2). The model utility types move UP into `@ts-runtypes/core` as standard types (see section 2), so nothing type-level is duplicated across the dialect packages; `common.types.ts` (MustBeNever, stub-only) stays per package. **No shared "drizzle core" package** (a fourth package fits neither version line, adds a release-approval step, and couples the dialects; the shared types now live in `@ts-runtypes/core`, which all three already depend on; the manifests + Go generator are repo tooling, never published). `param-recovery.stub.ts` and `proxy-completeness.stub.ts` split per dialect into each package's stubs (their sections are already per-dialect; confirm param-recovery splits cleanly at implementation).

package.json per dialect: `version: 0.45.0`, marker field `"versionLine": "drizzle-orm"` (read by release scripts), deps only `@ts-runtypes/core: workspace:*` (drop `@mionjs/core`, never imported), and `peerDependencies: {"drizzle-orm": ">=0.45.0 <0.46.0"}`. The peer RANGE is a deliberate exception to the exact-pin policy (document in CLAUDE.md): the package re-exports drizzle-orm, so the consumer's single instance must resolve, and the range IS the compatibility promise. Root package.json gains `drizzle-orm` exact devDep so workspace tests resolve it (all devDeps root-level).

Root wiring: vitest.config.ts swaps the drizzle project for three (`drizzle-pg|mysql|sqlite`); CLAUDE.md package list + project count updated; `packages/drizzle/` deleted in the same PR.

### 2. Standard model types in @ts-runtypes/core + type-level refinement per dialect

**Standard model types (user decision):** move the model utility types into `@ts-runtypes/core` (new `packages/ts-runtypes/src/modelTypes.ts`, exported from the root) so the model shapes are STANDARD runtypes vocabulary, defined once and reused by every dialect package instead of duplicated:

- `SelectModel<M>` (the full row), `InsertModel<M, Generated, Defaulted>` (generated keys removed, defaulted keys optional), `UpdateModel<M, Generated>` (everything optional, generated still excluded). These are the current types from packages/drizzle/src/types/models.types.ts, moved AS-IS with their names kept (user decision: keep the already-planned names, no rename).
- **Dependency check (VERIFIED)**: the move adds NO drizzle dependency to runtypes. models.types.ts has zero imports (pure transforms over a generic T using only built-in TS utilities), and its spec imports only `@ts-runtypes/core` + vitest and pins a hand-written interface, so both move as-is. All drizzle-typed pieces (`InferSelectModel`, `InferInsertModel`, the `PgTable`/`MySqlTable`/`SQLiteTable` constraints) stay in the dialect packages, which compose the standard types (`UpdateModel<InferInsertModel<T>>`). Standing rule for the implementer: if any future model-utility addition would need a drizzle import, it does NOT go into runtypes, the dialect packages define it themselves.
- The dialect packages re-export them and compose them with drizzle's own inference for the table-aware Infer* utilities (below). `packages/drizzle/src/types/models.types.ts` is deleted (its spec moves to ts-runtypes' test tree).
- NOT wanted (user decision, explicitly withdrawn): drizzle-zod-style `createSelectSchema/createInsertSchema/createUpdateSchema` functions returning a schema object bundling multiple functions. The API stays type-level; a later iteration may customise the compiled functions per derived model, which the type-level surface leaves open.

**Type-level only (user decision, supersedes the factory grid):** the dialect
packages ship NO validate/mock/encode factory functions. They work purely at the
type level: refine the table's types, derive model TYPES from it, and every
runtypes function is then obtained through the standard generic API the consumer
already knows (`createValidateFn<User>()`, `createGetValidationErrorsFn`,
`createJsonEncoderFn/DecoderFn`, `createMockDataFn`, ...). No markers, no
`getRTFunction` wiring, no per-call refinements, nothing runtime in our packages
beyond the proxy builders and one identity function:

```ts
const userModel = pgTable('users', {
  name: varchar('name', {length: 100}).notNull(), // captured as Str<{maxLength: 100}>
});

// refine: same table object back, types tightened (API stricter than the DB)
const apiUser = refineTableType(userModel, {name: {minLength: 10}});

// derive model types; all functions come from the standard runtypes API
type User = InferSelect<typeof apiUser>;          // name: Str<{minLength: 10, maxLength: 100}>
type NewUser = InferInsert<typeof apiUser>;
type UserPatch = InferUpdate<typeof apiUser>;
const validateUser = createValidateFn<User>();
const mockUser = createMockDataFn<User>();
```

Surface per dialect package (besides the proxy builders):

- `refineTableType(table, refinements)` - the ONE runtime export, and it is identity
  (returns the SAME table object retyped; never alters drizzle's runtime column
  config or SQL). Refinements are plain per-column format PARAM objects
  (`{name: {minLength: 10}}`, literal-inferred via a const type param); each
  column's params MERGE into its captured format params (user decision: minLength
  added, captured maxLength kept) through a `MergeFormat` type utility. A param
  the column's format family does not support, or one whose base type disagrees
  with the column's value type (a number param on a string column), is a compile
  error, never a drizzle-zod-style bypass (a compiled validator that disagrees
  with what the DB returns is unacceptable). Nullability cannot be changed (SQL
  truth lives in notNull); json columns keep `.$type<T>()` as their replacement
  channel. The substitution point is VERIFIED: model inference reads the column's
  `_.data` slot (`GetColumnData`, node_modules/drizzle-orm/column.d.ts:65), the
  same slot `.$type` and our proxy stamps write, and `notNull`/`hasDefault`/
  `generated` are untouched so nullability and insert optionality survive.
- Table-aware type utilities: `InferSelect<T>` (= drizzle's `InferSelectModel`),
  `InferInsert<T>` (= `InferInsertModel`), `InferUpdate<T>`
  (= `UpdateModel<InferInsertModel<T>>`, drizzle-zod's update semantics), thin
  aliases over drizzle's inference plus the core `SelectModel/InsertModel/
  UpdateModel` utilities, so consumers import from one place; drizzle's own
  names keep working via the star re-export. (The request sketched
  `InferDrizzleType`; the trio keeps drizzle's select/insert/update vocabulary,
  an `InferDrizzleType` alias of `InferSelect` is the implementer's call.)

Notes:

- drizzle-zod comparison (verified against their docs): their
  `createSelectSchema/createInsertSchema/createUpdateSchema(table, refinements?)`
  compose zod schemas at RUNTIME (callback extends, plain schema overwrites with
  compatibility bypassed); runtypes compiles functions from TYPES at build time,
  which is why our equivalent is table refinement + the standard generic
  factories instead of schema-returning functions. Zod's arbitrary predicate
  callbacks (`.refine(fn)`) have no compiled equivalent (formats are a fixed
  catalog, no custom-format registry today): documented as a wrapper pattern
  around the compiled validator; a custom-format registry is its own future todo.
- Two call sites deriving the SAME refined type share ONE compiled function
  (standard cache behavior, pin in tests); different refinements are different
  types and compile their own entries.
- `createQuery*` stays OUT OF SCOPE: drizzle has no query model, a query result
  is the select model or a hand-projected type `createValidateFn<T>()` already
  serves; say so on the docs page.
- RISK: `refineTableType`'s mapped-type surgery over a BUILT table's column configs
  (replacing only `data` inside `PgTableWithColumns`) is heavier than the builder
  stamps, and `MergeFormat` needs the format param generics exposed; validate
  these FIRST, builder-level refinement is the fallback. `refineTableType` touches
  only drizzle's base `Table` shape, so the three per-dialect exports are one
  shared implementation pattern (parity-tested like the rest).

### 3. Versioning + publishing

- Version rule (user decision): `<drizzle major>.<drizzle minor>.<our patch>`; drizzle-orm 0.45.2 -> first publish 0.45.0; our fixes bump only patch (per package, they may diverge); patch resets to 0 on a drizzle minor bump. Source of truth: each package's own package.json version.
- `scripts/release/bump-version.mjs:53-62` (lockstep stamping loop) skips `versionLine === 'drizzle-orm'` packages.
- NEW guard `scripts/release/check-drizzle-versions.mjs` in preflight + ci.yml/release-gate.yml (next to the drizzle-manifest --check steps): version major.minor == installed drizzle-orm major.minor; peer range == `>=X.Y.0 <X.(Y+1).0`; each committed manifest's `drizzleOrm` field == installed version.
- Release train (`scripts/release/`): publish-tarballs.mjs train filter gains `mionjs-drizzle-orm-` prefix + rank 3 (after @ts-runtypes/core); SKIP-IF-LIVE per dialect tarball (`npm view name@version`, versions do not bump every release); backport safety: publish with `--tag drizzle-X.Y` when the tarball version is lower than live `latest`. stage-approve.mjs accepts the per-package versions + rank 3. manual-publish.mjs filter + rank extended (REQUIRED for the first publish of the three names). verify-live.mjs checks the dialect packages exist live at their tree versions. pack.mjs/receipt.mjs need no change (auto-discovery).
- e2e (`scripts/release/e2e.mjs`): drop `@mionjs/drizzle` from MION_CONSUMER_PACKAGES (~line 60), add the three names with per-package version pins (new internal env var registered in scripts/lib/env.mjs REGISTRY); update container/pre-publish-e2e/mion-consumer packaged-sources.spec.ts list; ADD a consumer spec proving `createValidateFn<InferSelect<typeof users>>()` over a table built (and refined) with the PUBLISHED package enforces a captured and a refined param, the end-to-end proof that the stamped/refined types survive the published d.ts.

### 4. Manifest / generator config

- Each package owns its manifest: `packages/drizzle-orm-pg-core/manifests/pg.manifest.json` etc. The hand-owned config moves to `drizzle-dialects.json` at the repo root (tool config, not a package; user decision after review); rows gain per-dialect `packageDir`, `proxy`/`manifest` become packageDir-relative.
- Go (`ts-go-runtypes/cmd/gen-drizzle-manifest/`): Config.PackageDir moves onto DialectConfig; loadConfig/loadCommitted/stray/write resolve per packageDir; extract() Cwd -> repo root (hoisted node_modules); drizzleOrmVersion resolves per row with an all-rows-same-version invariant; gen_test.go updated. `scripts/rt.mjs` --config path + help updated.
- `.claude/skills/drizzle-proxy-migration/SKILL.md`: all paths/names, plus "adding a dialect = new package" checklist (dialects.json row + package skeleton; release membership is automatic via versionLine).

### 5. npm migration

`@mionjs/drizzle@0.8.10` stays as-is (no bridge release; the mion train is held back); after the new packages are live, owner runs `npm deprecate @mionjs/drizzle "Replaced by @mionjs/drizzle-orm-pg-core / -mysql-core / -sqlite-core"`; documented in CHANGELOG + SETUP.md publishing section.

## Tests

- Moved per package: proxy spec (index.spec.ts), stubs + tsconfig.stubs typecheck runner, manifest-coverage.spec.ts (per-package manifest path).
- NEW refine.spec.ts per dialect: `createValidateFn<InferSelect<typeof refineTableType(users, {...})>>()` enforces the merged bound (minLength) AND the captured one (maxLength) while the unrefined table's validator does not; insert optionality + update partiality through `InferInsert`/`InferUpdate`; mock output passes validate; `refineTableType` returns the reference-identical table object; two call sites deriving the SAME refined type share ONE compiled function; paired `getRunTypeId<Model>()` + `getRunTypeId(value)` with hash equivalence (Marker rule).
- Refinement stub pins: same-format refinement MERGES params; an unsupported param key or a base-type mismatch (number param on a string column) is a compile error; nullability and generated/default flags unchanged after refinement.
- NEW parity spec (pg package): refine.ts identical across the three packages modulo allowlisted dialect tokens (import specifiers, table type names).
- Model types in `@ts-runtypes/core`: move the current models.spec.ts type pins into the ts-runtypes test tree unchanged and keep the dialect stubs pinning the composed shapes (e.g. `InferUpdate<T>` keeps formats and drops generated keys).
- Version guard runs in CI; e2e consumer lane per section 3.

## Docs

- Website 03.drizzle-orm/00.drizzle-overview.md (package table, versioning note, new "refine and derive your models" section with a code-import showing refineTableType + Infer* + the standard createValidateFn/createMockDataFn), 01.column-formats.md, quick-start import mention; twoslash.post.ts mounts the three dists. MDC counts rule applies. The runtypes site gets a short mention of the standard SelectModel/InsertModel/UpdateModel utilities where model types are documented.
- Examples: update the five drizzle example files' imports; add drizzle-refine-example.ts (used by the new docs section); examples package.json deps swap.

## Fuzzing

Not a fuzz candidate on its own (the packages are type-level; validators/mocks are the already-fuzzed compiled functions); the mock-passes-validate spec is the cheap oracle and lives in refine.spec.ts.

## Out of scope

`createQuery*`; factory functions of any kind (validate/mock/encode come from the standard runtypes API over the derived types); custom-format registry for arbitrary predicate refinements; driver-level packages (`drizzle-orm-node-postgres` and friends); putting the rest of @mionjs/* on the release train; unpublish.mjs.

## Done when

`pnpm test`, `go -C ts-go-runtypes test ./internal/...`, `pnpm rtx core drizzle-manifest --check`, the new version guard, `pnpm run lint`, root typecheck and `pnpm rtx release e2e` are green with the three packages replacing `@mionjs/drizzle` everywhere in the tree; `refineTableType` merges/rejects per the rules above and validators derived from refined tables enforce both captured and refined params; publish-tarballs dry-run ranks/filters/skips the new tarballs correctly; docs site builds; first-publish + deprecate steps documented.

## Risks / notes for the implementer

- Resolver cost of `createValidateFn<T>` call sites where T is derived through drizzle's heavy table generics (`InferSelect<typeof refined>`): ordinary marker call sites, but more checker work per site than a plain interface; validate early with refine.spec.ts.
- The refinement type surgery on built tables and `MergeFormat` are the hardest type-level pieces; validate them FIRST, builder-level refinement is the fallback.
- stage-approve behavior on mixed-version queues is unverified against the live registry; the manual fallback path is the net.
- The guard cannot catch a FORGOTTEN patch bump (an unchanged version is silently skipped as already-live, by design); shepherd the first backport manually.
- Slices 1+2 (packages + generator config) must land in ONE PR (the manifest CI gate breaks between them); release machinery + docs can be the same PR or a fast-follow before the next release.


## Implementation notes (as shipped, 2026-08-27)

Shipped as planned, with these deltas:

- The risk spike PASSED: refineTableType's mapped-type surgery over BUILT tables works (columns rebuilt as `PgColumn<Update<Config, {data: MergeFormat<...>}>, ...>`; `InferSelectModel` reads the replaced `_.data` slot, notNull/hasDefault untouched). The builder-level fallback was never needed.
- MergeFormat, the family catalog (`RefinableParamsByFamily` + `RefinableParamsOf`) and `FormatBaseOf` were later hoisted into `@ts-runtypes/core/formats` (formats/refineFormat.ts, user decision: drizzle-free + reusable lives in runtypes); the dialect packages consume them. Refinable params are keyed by format FAMILY (`stringFormat`/`numberFormat`/`bigintFormat`/`nativeDate`/`date`/`time`/`dateTime`/`ip`), so wrong-family, unknown-param, unknown-column, passthrough-column and nullability refinements are all compile errors (pinned in refine.stub.ts per dialect).
- The e2e consumer lane needed NO new env var: `RT_E2E_MION_PKGS` already carries explicit `name@version` pins, so the drizzle packages simply ride it at their own versions (env REGISTRY description updated instead).
- `publish-tarballs.mjs` gained a `--plan` flag (prints train filter, order, skip-if-live and backport-tag decisions without publishing) as the dry-run verification the Done-when asked for.
- The moved model-types spec lives at `packages/ts-runtypes/test/features/modelTypes.test.ts` (`.test.ts`, the runtypes test-tree convention).
- The parity spec is `packages/drizzle-orm-pg-core/src/refine-parity.spec.ts`.
- sqlite `text()` WITHOUT a length types as the wrapper's overload union (`Str | Str<{maxLength: number}>`); its refine stub pins that shape.
- The npm deprecate step is documented in SETUP.md's Publishing section only (CHANGELOG entries are git-cliff-generated from commits, so no hand edit).
- The unused `test-support/temporal-ambient.d.ts` was dropped (no drizzle spec reflects Temporal props anymore).
- Post-review addition: `pnpm rtx core drizzle-manifest --pending` prints the review queue (dialect, kind, overload params, reason) so agents work from the command output instead of hand-reading the manifest JSON; the skill points at it.
