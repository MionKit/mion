# Key drizzle's column mapping on ts-runtypes type formats (and fix the dead brand branch)

**Status:** todo
**Type:** bug (live type/runtime divergence) + refactor
**Created:** 2026-07-28
**Supersedes:** `drizzle-owns-brand-vocabulary.md` and `formats-brandname-upstream.md` — both were
symptoms of the same thing, see below.

## TL;DR

`@mionjs/drizzle` decides a column two different ways. The **runtime** mapper keys off ts-runtypes'
`formatAnnotation`. The **type** lane keys off a `{brand: string}` property that **nothing produces
any more** — so it is dead, and every format-typed property silently falls through to a primitive
column. `email: Email` types as `text` while the runtime emits `varchar(254)`.

Both superseded todos existed only to prop up that brand lane. Keying the type lane on
`__rtFormatName` instead deletes the lane, deletes both todos, and makes the two lanes agree for the
first time.

## Why the two old todos were one issue

| Old todo | What it asked for | Why it dissolves |
|---|---|---|
| `drizzle-owns-brand-vocabulary.md` | `AllBrandNames` is a hand-maintained list anchored to nothing — derive it from a real source of truth | Keying on `FormatName` **is** that source of truth: upstream-generated, not hand-written |
| `formats-brandname-upstream.md` | Upstream formats carry `BrandName = never`, so a `Format` is not assignable to a `Brand` — ask upstream to give built-ins real brands | Only needed if drizzle matches on brands. It should not. No upstream change required. |

You were right that these are the same issue: drizzle wanted a **nominal type-level marker**, brands
were the only thing that provided one, and everything else followed from that. Formats already carry
the marker drizzle actually needs — a *name*, not a nominal identity.

## The bug (verified with `tsc`, not reasoned)

`packages/drizze/src/types/postgres.types.ts:126-142` (twins at `sqlite.types.ts:110`,
`mysql.types.ts:122`):

```ts
export type PgColumnType<K extends string, T> =
    T extends {brand: infer B extends string}          // ← never true any more
        ? B extends keyof PgBrandColumnMap<K> ? $Type<PgBrandColumnMap<K>[B], T> : ...
        : T extends string | number | boolean | bigint
          ? PgPrimitiveColumnType<K, T>                // ← every format lands here
          : ...
```

The only thing that ever produced a `brand` property was mion's `Brand<Base, Name>` helper, deleted
in `0c37809d`. Upstream `TypeFormat` emits `__rtFormatName` / `__rtFormatParams` / `__rtFormatBrand`
— never a bare `brand`.

Confirmed by compiling assertions against the real declarations:

```ts
PgColumnType<'email', Email>  ≡  PgColumnType<'email', string>   // text,             runtime: varchar(254)
PgColumnType<'id',    UUIDv7> ≡  PgColumnType<'id',    string>   // text,             runtime: uuid
PgColumnType<'age',   Integer>≡  PgColumnType<'age',   number>   // doublePrecision,  runtime: integer
```

**Nothing catches this.** `stubs-formats-mappings/type-inference.spec.ts` shells out to `tsc` and
asserts only "no errors" — and there are none, because `Email` is mutually assignable with `string`
(the sentinels are optional by design), so assigning a `PgTextColumn` result back to an `Email` slot
typechecks happily. The test cannot see that the wrong column was chosen.

The `_Missing*Brands` / `_Extra*Brands` "completeness guards" do not catch it either: they compute a
type and never assert on it. No `extends never ? ... :` check, no `satisfies`. Adding a name to
`AllBrandNames` without updating a dialect map compiles clean today.

## The crux: format metadata IS reachable from the type system — but not the obvious way

The naive form **does not work**, and upstream documents why (`schema/static.ts:197-200`): the
sentinels are optional so that a plain `'hello'` still flows into a format-typed slot, and *an
optional property does not satisfy a required-property constraint*.

```ts
type NaiveName<T> = T extends {__rtFormatName: infer N} ? N : never;   // NaiveName<Email> = never  ✗
```

The working idiom is key-presence detection plus indexed access — the same shape upstream uses
internally:

```ts
type FormatNameOf<T>   = '__rtFormatName'   extends keyof T ? NonNullable<T['__rtFormatName']>   : never;
type FormatParamsOf<T> = '__rtFormatParams' extends keyof T ? NonNullable<T['__rtFormatParams']> : never;
```

Both compile and resolve correctly (verified):

| expression | resolves to |
|---|---|
| `FormatNameOf<Email>` | `'email'` |
| `FormatNameOf<UUIDv7>` | `'uuid'` |
| `FormatNameOf<Integer>` / `<Int8>` / `<Float>` | `'numberFormat'` |
| `FormatParamsOf<Email>['maxLength']` | `254` (literal, not `number`) |
| `FormatParamsOf<Int8>['integer']` / `['min']` | `true` / `-128` |
| `FormatParamsOf<Float>['float']` | `true` |

So the type lane can read both the format name **and** its params, with literal types — everything
the runtime mapper uses.

## Plan

1. **Rekey the dialect maps on `FormatName`.** `PgBrandColumnMap` → `PgFormatColumnMap`, keyed by
   upstream's generated names instead of drizzle's 20 hand-written strings. The 8 string formats map
   1:1 with **identical spellings** (`dateTime` included — no casing drift).
2. **Resolve the numeric formats from params, not from the key.** All 12 numeric brands
   (`integer`, `float`, `int8`, `uint32`, …) collapse to `'numberFormat'` upstream — they are param
   presets over one format, deliberately (`numberFormats.ts:51-56`). Discriminate with
   `FormatParamsOf<T>['integer']` exactly as the runtime does with `isIntegerFormat`. **No behavioural
   loss:** all twelve already produce the same two columns per dialect at runtime.
3. **Delete the brand lane.** `AllBrandNames`, the three `*BrandColumnMap` types, the `{brand:}`
   branch, and the six `_Missing*`/`_Extra*` aliases.
4. **Make the guards actually assert.** While rekeying, turn them into a real check against
   `FormatName` — e.g. a `never`-constrained alias or a `satisfies` — so an unhandled format is a
   compile error rather than a comment.
5. **Decide the scope of `FormatName` explicitly.** It has 18 members, not 20, and a different shape.
   `stringFormat` / `bigintFormat` / `numberFormat` are already handled at runtime; `nativeDate` and
   the six `temporal*` formats are not. Each needs a column or a documented exclusion — the runtime
   currently falls back to text silently, which is the behaviour to either keep or replace.
6. **Mind `date` vs `nativeDate`.** Upstream `date` is a **string** date; a `Date` instance is
   `nativeDate` (`kind: RunTypeKind.class`). Drizzle's `isDate` branch runs *before* format dispatch
   (`base.mapper.ts:43`), so keying on the name alone would conflate them. `typeFormats[name].kind`
   is the discriminator and drizzle ignores it today.

## Out of scope / accept

`lengthBuffer` (`DrizzleMapperConfig`) has no type-level analogue — `Math.ceil(maxLength * 1.5)` is
not expressible in the type system. Type-level varchar sizing would be exact-params-only, so the two
lanes would still differ on *width* even once they agree on *column*. Either drop the buffer, or
accept that the inferred type is the unbuffered shape and document it.

## Tests

The existing stub typecheck cannot catch column-choice regressions (see above). Needs assertions that
compare the *resolved column type* against the expected one, not just "compiles":

```ts
type Assert<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _email: Assert<PgColumnType<'email', Email>, PgVarcharColumn<'email'>> = true;
```

Cover: each of the 8 string formats; `Integer` → integer and `Float` → double per dialect; at least
one `Int8`-style preset; a bare `string`/`number` still hitting the primitive lane; a `Date` still
hitting the timestamp lane; and an unhandled format hitting whatever fallback step 5 settles on.

Then add a test that the type lane and the runtime mapper agree — the divergence above existed
precisely because nothing compared them.

## Done when

- `PgColumnType` & twins dispatch on `FormatNameOf<T>` / `FormatParamsOf<T>`; no `{brand:}` match
  remains anywhere.
- `AllBrandNames` and the `*BrandColumnMap` types are deleted.
- The completeness guards fail the build when a `FormatName` is unhandled.
- Type-level and runtime column choice are asserted to agree for every format drizzle claims to
  support.
