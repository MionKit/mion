---
type: feature
spec: guidelines
status: ready
created: 2026-08-27
---

# Drizzle proxy column builders with format-decorated types

## Intent

Give tables-first drizzle users full runtypes fidelity. Per-dialect proxy modules
re-export EVERY drizzle column function; each wrapper calls drizzle at runtime and
decorates the returned builder's data type with the matching runtype format, capturing
the caller's param literals in OUR signature. What the proxies look like:

```ts
// @mionjs/drizzle/pg — the proxy module
import {varchar as drizzleVarchar, numeric as drizzleNumeric, integer as drizzleInteger} from 'drizzle-orm/pg-core';
import type {String as Str, Number as Num, Integer} from '@ts-runtypes/core/formats';

// Same name, same params, same runtime as drizzle. OUR generic captures the
// literal length, and .$type stamps the format so it reaches the model type.
export function varchar<TName extends string, L extends number>(name: TName, config: {length: L}) {
  return drizzleVarchar(name, config).$type<Str<{maxLength: L}>>();
}

// precision/scale are ERASED by drizzle's own types (param-recovery spike);
// captured here they survive as format params and reach the compiled validator.
export function numeric<TName extends string, P extends number, S extends number>(
  name: TName,
  config: {precision: P; scale: S}
) {
  return drizzleNumeric(name, {...config, mode: 'number'}).$type<Num<{integer: false}>>();
}

export function integer<TName extends string>(name: TName) {
  return drizzleInteger(name).$type<Integer>();
}
```

And what the consumer gets, with zero extra steps:

```ts
import {pgTable} from 'drizzle-orm/pg-core';
import {varchar, integer} from '@mionjs/drizzle/pg';

const users = pgTable('users', {
  id: integer('id').primaryKey(),          // chainables untouched, .$type is drizzle's own
  name: varchar('name', {length: 100}).notNull(),
});

type User = InferSelectModel<typeof users>;
// { id: Integer; name: String<{maxLength: 100}> }  <- formats, not plain string/number

const validate = createValidateFn<User>();
validate({id: 1, name: 'x'.repeat(101)}); // false: maxLength 100 is IN the compiled fn
// and any route typed with User shares this exact function object
```

The compiled validators enforce every captured param (length, precision, ranges)
with no runtime guards, and routes typed with the same model share the exact same
compiled functions.

Why wrappers instead of recovering params from drizzle's types: the param-recovery
spike (`packages/drizzle/src/stubs-formats-mappings/param-recovery.stub.ts`) pins that
drizzle's BUILT table types erase decimal precision/scale, mysql varchar/varbinary
length, unsigned, timestamp precision/withTimezone, unique() and references(). Wrappers
capture params at declaration time, so nothing depends on what drizzle's types keep.

Proven joints (do not re-derive): `.$type<T>()` flows into InferSelectModel and the
compiled validators (`fuzz.metadataOracle.spec.ts` pgArticles at the time of writing,
`src/types/models.spec.ts`), and chainables keep working because $type is drizzle's
own channel.

## Direction

The implementer plans the details. The load-bearing piece is the DETERMINISTIC drift
tooling, mirroring existing repo machinery
(`pnpm rtx core codegen typeformats --check`; the enrich CLI + skill pairing):

1. **Manifest codegen script** (new `rtx` command): extract every exported column
   function and its param shapes from drizzle-orm's d.ts (TS compiler API over
   pg-core / mysql-core / sqlite-core) into a COMMITTED manifest JSON. Each entry:
   `{dialect, fn, params, status: migrated | pending | skipped}` (skipped requires a
   reason). The script generates/refreshes entries; humans and agents never hand-list
   the surface.
2. **`--check` drift gate** (CI): fails when drizzle exports something the manifest
   does not know, when a param shape changed against the recorded one (drizzle
   upgrade), or when the proxy module is missing an entry marked migrated. A `pending`
   entry also fails the gate, like `@todo` in enrich files.
3. **New agent skill** (`.claude/skills/`): reads the pending entries and instructs
   how to author each wrapper: which format type, which params become format params,
   the paired tests (see the FormatColumnFactory maps in `src/mappers/*.mapper.ts` as
   the mapping reference). The script decides WHAT to migrate, the agent decides HOW
   to map.
4. Type-level backstop in the proxy itself: an export-completeness assert
   (`Exclude<keyof typeof import('drizzle-orm/pg-core'), keyof proxy>` must be never,
   MustBeNever style like the format column maps).

Open for the implementer: packaging (subpaths `@mionjs/drizzle/pg` vs separate
packages); how semantic overrides look (`.$type<Email>()` stays the manual escape
hatch); whether table-level constructs (pgTable, pgEnum, indexes) are re-exported
as-is or wrapped.

This COMPLEMENTS the types-first lane; it does not resurrect createXSchema.
Validation still flows through model types and markers, never through schema objects.

## Done when

- Proxy surfaces for pg, mysql and sqlite cover 100% of drizzle's column functions,
  with the manifest `--check` green in CI and wired into `rtx`.
- A table declared with proxy builders yields an InferSelectModel carrying format
  types; the compiled validators enforce the captured params with no runtime guards;
  shared-compiled-fn reference equality with route types holds (extend
  `src/types/models.spec.ts`-style coverage).
- The gap-filling skill exists and was used to drive at least one full migration pass.
- Website docs cover the tables-first workflow with the proxy builders.

## Plan — proxy builders + Go manifest tooling (approved 2026-08-27)

Design decisions resolved by the implementer (approved by the developer):

- **Packaging:** subpath exports on @mionjs/drizzle (`./pg`, `./mysql`, `./sqlite`), never
  separate packages (see docs/done/proxy-packages-removal.md). The `source` export
  condition is mandatory (vitest resolves `['source']`). No root re-export: the three
  dialects collide on names.
- **Surface:** each proxy does `export * from 'drizzle-orm/<dialect>-core'` (tables,
  enums, indexes, types pass through) with local wrapper functions shadowing the column
  builders. Per-function coverage is enforced by the manifest gate, not the star.
- **Wrappers never change runtime behavior:** the body forwards the call verbatim; the
  format stamp is type-only via drizzle's `$Type<Builder, Format>` (the idiom in
  src/types/postgres.types.ts). Deviation from the sketch above: `numeric` does NOT
  force `mode: 'number'`; the format tracks the caller's declared mode (string mode
  stays passthrough).
- **Enum-carrying configs keep drizzle's literal-union typing.** Columns with no
  matching format (geometry, point, vector, interval, cidr, macaddr, customType, ...)
  are `skipped` in the manifest with a written reason.
- **The manifest generator is a Go command** in ts-go-runtypes
  (`cmd/gen-drizzle-manifest`), reusing the embedded TypeScript checker via
  `internal/compiler/program` — no second TS-parsing program in node. Wired as
  `pnpm rtx core drizzle-manifest [--check]` (own subcommand, not a CODEGEN row: the
  registry's `--check` is git-diff-only, and this gate also fails on pending entries
  and on migrated entries missing from the proxy files). One explicit CI step in
  ci.yml and release-gate.yml, after the codegen drift step.
- **Manifest:** committed to packages/drizzle/drizzle-columns.manifest.json. Merge
  rules: new column fn -> pending; statuses/reasons preserved; a migrated entry whose
  recorded params drift downgrades to pending; a top-level drizzleOrm version field
  makes any upgrade visible.
- **Tests:** proxy type stubs (InferSelectModel format pins, Parameters assignability,
  completeness MustBeNever asserts), runtime specs per dialect (validator boundary
  cases, shared-compiled-fn reference equality, both getRunTypeId shapes), a
  manifest-coverage spec, runtime identity asserts vs raw drizzle columns.
- **Not a fuzz candidate:** the captured constraints live in the type system and
  validators compile from static types, so there is no runtime input space to
  randomize against an oracle.
- **Correction:** the "Proven joints" paragraph above cites fuzz.metadataOracle.spec.ts,
  which was deleted in commit b2ff231. The live proofs are
  src/stubs-formats-mappings/param-recovery.stub.ts ($type survives into built tables)
  and src/types/models.spec.ts (format params reach compiled validators, shared-fn
  reference equality).
