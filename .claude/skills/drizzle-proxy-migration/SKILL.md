---
name: drizzle-proxy-migration
description: Author or update the @mionjs/drizzle proxy column builders from the committed drizzle manifest. Use whenever packages/drizzle/drizzle-columns.manifest.json has pending entries, when `pnpm rtx core drizzle-manifest --check` fails (new drizzle exports, drifted param shapes, migrated entries missing from a proxy file), after a drizzle-orm version bump, or when adding/changing a wrapper in packages/drizzle/src/proxies/. Drives the whole loop, regenerate the manifest, map each pending column function to a runtype format (or skip it with a reason), author the wrapper with a type-only $Type stamp, add the paired tests, flip the status, and get the check green.
---

# drizzle-proxy-migration

The proxy modules `packages/drizzle/src/proxies/{pg,mysql,sqlite}.ts` re-export every
drizzle column builder (`@mionjs/drizzle/pg|mysql|sqlite`). Each wrapper calls drizzle
unchanged and stamps the returned builder's data type with a runtype format that
captures the caller's literal config params, so `InferSelectModel` carries formats and
the compiled validators enforce them. The committed manifest
`packages/drizzle/drizzle-columns.manifest.json` is the source of truth for coverage:
the Go generator decides WHAT needs migrating, this skill decides HOW to map it.

## The loop

1. `pnpm rtx core drizzle-manifest` regenerates the manifest (statuses are preserved;
   new drizzle column fns arrive as `pending`; a migrated entry whose recorded params
   drifted is downgraded to `pending` with the old shape in `reason`).
2. Open the manifest and take the `pending` entries, one dialect at a time.
3. For each entry decide the mapping (table below): author a wrapper, or set
   `status: "skipped"` with a written `reason`.
4. Add the paired tests (contract below).
5. Hand-edit the entry to `status: "migrated"` (remove any leftover `reason`).
6. Rerun `pnpm rtx core drizzle-manifest`, it validates that every migrated fn is a
   LOCAL export of the proxy file. `--check` is green when no `pending` remain and
   nothing drifted.

You may only hand-edit `status` and `reason` on column entries. Never hand-edit
`params`, `kind`, or add/remove entries, the generator owns those.

## Three hard rules

1. **The format's value type MUST match the runtime value for the caller's declared
   mode.** Drizzle modes change what the driver returns: pg `numeric` default mode
   returns a string (passthrough, no number format), `mode: 'number'` returns a number
   (`Number` format), `timestamp` `mode: 'date'` returns a Date (`Date` native format)
   while `mode: 'string'` returns a string (`StringDateTime`). Never force a mode on
   the caller (the wrapper forwards config verbatim), and never stamp a format whose
   base type disagrees with the mode's value type. Conditional return types keyed on
   the mode generic are the tool (see `numeric` in `src/proxies/pg.ts`).
2. **Enum-carrying configs keep drizzle's literal-union typing.** When the caller
   passes `{enum: [...]}` (pg/mysql text, varchar, char, mysqlEnum), drizzle's own
   generics already capture the exact literal union; stamping a String format over it
   would LOSE precision. The enum path stays unstamped.
3. **No matching format means `skipped`, never a forced wrapper.** Geometry, point,
   line, vector, interval, cidr, macaddr, customType and friends have no runtype
   format; they pass through via `export *` with drizzle's own types, and the manifest
   entry records `status: "skipped"` plus a reason. Skipped columns still work, they
   just validate as their plain primitive.

## Mapping table (inverse of `src/mappers/*.mapper.ts`)

The runtime mappers map format -> column; wrappers invert that (column -> format).
When unsure, the mapper files are the authority for which column a format round-trips
through. Formats come from `@ts-runtypes/core/formats` (Temporal ones from
`@ts-runtypes/core/formats/temporal`).

| column fn (dialect) | format stamp | captured params |
|---|---|---|
| varchar / char (pg, mysql) | `String<{maxLength: L}>` (`char`: `{length: L}` exact) | `L` from `{length}` |
| text (all) | `String` only when no enum; enum path unstamped | none |
| uuid (pg) | `UUID` | none |
| inet (pg) | `IP` | none |
| integer/int (pg, mysql) | `Integer` | none |
| smallint (pg, mysql) | `Int16` | none |
| tinyint (mysql) | `Int8` / `UInt8` when `{unsigned: true}` | unsigned |
| bigint mode 'bigint' | `BigInt64` (pg is always signed; mysql unsigned -> `BigUInt64`) | mode, unsigned |
| bigint mode 'number' | `Integer` | mode |
| doublePrecision / double / real / float | `Float` (annotation-only tag: fractional mocks + float64 packing; whole values like 2.0 still validate) | none |
| numeric / decimal mode 'number' | `Float`, capture P/S generics | precision, scale, mode |
| numeric / decimal default (string) or 'bigint' | passthrough (no stamp) | precision, scale |
| serial / smallserial (pg) | `Int32` / `Int16` (the storage width; positivity is a DB detail) | none |
| serial (mysql) | `PositiveInt` (bigint unsigned auto-increment in number mode) | none |
| bigserial (pg) | mode 'number' -> `Integer`, mode 'bigint' -> `BigInt64` | mode |
| boolean (pg, mysql) | passthrough (plain boolean, no format exists) | none |
| date mode 'date' | `Date` (native) | mode |
| date mode 'string' | `StringDate` | mode |
| time | `StringTime` | none |
| timestamp mode 'date' | `Date` (native) | mode, withTimezone/precision as generics |
| timestamp mode 'string' | `StringDateTime` | mode, withTimezone/precision |
| datetime (mysql) | same split as timestamp by mode | mode |
| json / jsonb | passthrough by default; `.$type<FormattedObject<...>>()` stays the caller's escape hatch | none |
| blob (sqlite) mode 'bigint' | `BigInt` family | mode |
| everything geometric/network/binary/custom | skipped with reason | n/a |

The table is guidance, not gospel: check the actual d.ts overloads for the pinned
drizzle version before authoring, and check the format's param shape in
`packages/ts-runtypes/src/formats/` before capturing a literal into it.

## Wrapper authoring pattern

- Reproduce ALL of drizzle's overloads, including the name-optional one
  (`fn(config?)` and `fn(name, config?)`), with our generics capturing every literal
  config param (`L extends number`, mode generics) even when a param cannot reach the
  format yet (numeric precision/scale), captured params are future-proof.
- The runtime body forwards verbatim and is shared by all overloads:
  `export function varchar(...args: unknown[]) { return (dVarchar as ...)(...args); }`
- The stamp is type-only, applied in the overload return type with drizzle's
  `$Type<Builder, Format>` from `drizzle-orm/column-builder`, never by calling
  `.$type()` at runtime.
- Builder generics for the `ReturnType<typeof dFn<...>>` aliases follow the existing
  pins in `src/types/{postgres,mysql,sqlite}.types.ts`.
- Wrappers live in the dialect's proxy file next to
  `export * from 'drizzle-orm/<dialect>-core'`; the local export shadows the star.

## Paired tests contract

Every migrated fn appears in the dialect's proxy stub
(`src/stubs-formats-mappings/proxy-<dialect>.stub.ts`): an `InferSelectModel` pin that
the format (not the plain primitive) comes out, plus `Parameters<...>` assignability
to drizzle's own fn. Param-carrying fns additionally get a boundary case in the
dialect's runtime spec (`src/proxies/<dialect>.spec.ts`), the invalid side of the
captured param must fail the compiled validator. Runtime specs follow the repo's
Marker test coverage rule (both `getRunTypeId` call shapes, paired).
