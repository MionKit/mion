# AI enrichment — `FriendlyText<T>` and `MockData<T>`

> **Status: implemented** (branch `feat/ai-enrichment`). **Shipped + tested:**
> - the `FriendlyText<T>` / `MockData<T>` DSL types (type-checked against `T`, with
>   structural node shapes — solution A), the pure-data `createFriendlyText<T>(map)`
>   renderer, and the `createMockDataFn<T>({ data })` integration — all exported from
>   `@mionjs/run-types`;
> - the Go CLI verb `enrich` / `enrich --no-emit` (`ts-go-runtypes/internal/enrichment`, a separate
>   package), incl. **named-type-driven emission** (one `const` per named type) and
>   the `enrich --no-emit` diagnostics **FT002 / FT003 / FT005 / MD001**;
> - **`enrich --update` reconcile + `enrich --prune`** — a value-preserving merge of an
>   existing mirror against the regenerated set (property merge, field rename,
>   `@rtType`/`@rtIds` markers, `@rtOrphan`/`@rtOrphanChild` carcasses), with a
>   byte-identical idempotent re-run, and a destructive prune sweep (see
>   [`enrich` semantics → `--update`](#enrich---update--reconcile-value-preserving-merge));
> - the **per-family mirror split** (`<genDir>/enriched/friendly/` + `<genDir>/enriched/mock/`
>   subtrees, with a one-shot auto-migration of pre-split combined mirrors) and the
>   **FriendlyText i18n layer** — per-locale translation mirrors, generator-owned
>   plural templates (checked by **FT006 / FT007 / FT008**), `createFriendlyTextI18n`,
>   `enrich --i18n` / `enrich --i18n --no-emit` (see [Translations (i18n)](#translations-i18n)).
>
> **Storage + consumption model (this doc):** enrichment is committed to a **mirror
> directory** (`src/__runtypes/enriched/`, configured via the tsconfig `plugins` entry;
> one subtree per artifact family — `friendly/` + `mock/`)
> and consumed through **real, committed imports** — never plugin-injected. This
> follows the persistence invariant ([below](#persistence-invariant--committed-artifacts-get-committed-links)):
> a committed artifact gets a committed (visible) link; only *ephemeral* cache modules
> are injected. The Vite plugin is **not** involved in enrichment at runtime.
>
> **Deferred refinements (design-stage below):** **MD003** (pool values validate —
> needs the runtime validator), the always-on *Vite-build* surfacing of the
> `FT0xx`/`MD0xx` diagnostics (today they run via the `enrich --no-emit` CLI mode, not the build),
> `FT004`/`MD002` (the precise types already make TS catch these), `FT010`/`MD010`
> drift + `MD004`, and the `$[val]` enrichment. Sections describing those note it.

## Why this is a new artifact class

Everything RunTypes emits today — validators, JSON/binary codecs, the reflection
bundle — is a **pure function of the type**: deterministic, regenerated every
build, never committed, correct by construction. There is no "sync" problem
because there is nothing to keep in sync; the artifact *is* the type, recomputed.
All of it lives only as regenerated files under the gitignored
`<genDir>/types/` + the `node_modules/.cache/ts-runtypes/` disk cache.

`FriendlyText<T>` and `MockData<T>` are a different species:

| Property        | Generated cache (today)         | Enrichment (this doc)                       |
| --------------- | ------------------------------- | ------------------------------------------- |
| Determinism     | Deterministic (`f(type)`)       | Non-deterministic (an LLM authored it)      |
| Content         | Glue (validators, codecs)       | The *value is the content* (a label, a message, a realistic name) |
| Cost            | Cheap, recompute every build    | Expensive (LLM call) — generate once        |
| Storage         | Ephemeral, gitignored           | **Committed** to the repo                   |
| Drift           | Impossible (recomputed)         | **Possible** — the type can change underneath it |

So these are **satellite artifacts keyed by a type**: authored once, committed,
and validated against the type forever after. They are *not* a code-emit family
like `validate`/`json`/`binary` — there is no runtime codegen and nothing on the
hot Vite path. The compiler's only jobs are (1) **`enrich`** — emit a committed
skeleton from the live type, and (2) **`enrich --no-emit`** — validate the authored literal
against the live type. Consumers reach the result through an ordinary committed
`import`, not through any id-routing or injection. This makes the feature a
*generation + validation + authoring* concern, primarily CLI-driven — the CLI verbs
are the authoring path, and an opt-in bundler-plugin option can drive the same
scaffold + sync (no translation content) in dev/watch.

### Persistence invariant — committed artifacts get committed links

The cache and enrichment differ in *identity*, and that dictates how each is
linked:

| | identified by | link to it |
| --- | --- | --- |
| Cache module (`<genDir>/types/*.js`) | **structural id** (location-independent, recomputed) | **plugin-injected** (regenerated every build — never hand-imported) |
| Enrichment (`src/__runtypes/enriched/*`) | **type name + source path** (human-meaningful, committed) | **real `import`** (visible, IDE-managed, in the dep graph) |

The rule: **a link's persistence matches its target's**. Committed artifact ⟹
committed (visible) import; ephemeral artifact ⟹ injected (invisible) link. The
dangerous middle — a *committed* file reached by an *invisible injected* link —
is rejected: it would hide a committed dependency from review, go-to-definition,
and the dependency graph, using the *same* injection channel that already carries
ephemeral cache links, so a reader could not tell a throwaway virtual module from
a file they are meant to edit. Keeping injection **exclusively** for ephemeral
modules gives a reliable tell: *invisible link ⟹ ephemeral; visible import ⟹
committed*. Enrichment therefore never rides the plugin's injection path.

The two artifacts:

- **`FriendlyText<T>`** — combined human-readable **labels + error messages** for a
  type. Pure data. Used for validation-error rendering today; powers form-building
  UI later.
- **`MockData<T>`** — realistic sample **value pools / ranges** per field. Feeds the
  existing `createMockDataFn<T>()` generator (which already accepts custom pools and
  per-property overrides), so the mechanical generator stays deterministic and the
  AI only supplies realistic values.

---

## `FriendlyText<T>`

### Node model

One recursive node. Every node is `{ rt$label, rt$errors, ...childFields }`:
`rt$`-prefixed keys are meta, every other key is a child field. Leaf nodes simply
have no children, so nesting is uniform with no `fields:` wrapper. The `rt$`
prefix is RESERVED: a source-type property named `rt$…` cannot be enriched —
`enrich` refuses it and `enrich --no-emit` reports FT011 (friendly) / MD011 (mock). A plain
`$`-prefixed property is an ordinary field.

```ts
// models/user.ts
export interface User {
  name: FormatString<{minLength: 2; maxLength: 60}>;
  age: FormatNumber<{min: 0; max: 120}>;
  isActive: boolean;
  tags: string[];
  profile: {
    email: FormatEmail;
    score: FormatNumber<{min: 0; max: 100}>;
  };
}
```

```ts
// the authored map — validated against User by tsc AND at scan time.
// The map is TOTAL: every field present, rt$label + rt$errors required on every
// node (blank '' = "no custom text", renderer falls back; deleting a key just
// re-scaffolds it — one type maps to exactly one shape).
const friendlyUser: FriendlyText<User> = {
  rt$label: 'User account',
  rt$errors: { type: '$[label] must be an object' },

  name: {
    rt$label: 'Full name',
    rt$errors: {
      type: '$[label] must be text',
      minLength: '$[label] needs at least $[val] characters',
      maxLength: '$[label] allows at most $[val] characters',
    },
  },
  age: {
    rt$label: 'Age',
    rt$errors: {
      type: '$[label] must be a number',
      min: '$[label] must be at least $[val]',
      max: '$[label] must be no more than $[val]',
    },
  },
  isActive: { rt$label: 'Active?', rt$errors: { type: '' } },

  tags: {
    rt$label: 'Tags',
    rt$errors: { type: '' },
    rt$items: { rt$label: '', rt$errors: { type: 'each tag must be text' } },
  },

  profile: {                         // nested object — same node shape, recursively
    rt$label: 'Profile',
    rt$errors: { type: '' },
    email: { rt$label: 'Email', rt$errors: { type: '', pattern: 'Enter a valid email address' } },
    score: { rt$label: 'Score', rt$errors: { type: '', min: 'min $[val]', max: 'max $[val]' } },
  },
};
```

Container meta keys: arrays/tuples use `rt$items` (element node); maps/sets use
`rt$keys` / `rt$values` (their error paths carry the object path-segment
`{key, failed}` — the renderer handles those). Unions get node-level
`rt$label` / `rt$errors` only in v1; per-member addressing (`$members`) is deferred.

### Error keys = the verified `(format.name, formatPath-tail)` discriminator

Each `rt$errors` key names the failed sub-constraint. This is **not** an invented
key set — it maps 1:1 onto what `createGetValidationErrorsFn<T>()` actually emits.
A validation failure is a `RTValidationError` (see
[`createRTFunctions.ts`](../packages/run-types/src/createRTFunctions.ts)):

```ts
interface RTValidationError {
  path: (string | number | object)[];      // ['profile','email'] · [1] · [{key,failed}]
  expected: string;                          // 'string' | 'number' | 'objectLiteral' | …
  format?: { name: string; val: …; formatPath: (string | number)[] };
}
```

The `rt$errors` key is **`error.format.formatPath.at(-1)`**, and `type` is the base
type-shape failure (a `RTValidationError` with no `.format`). The Go format emitters
([`ts-go-runtypes/internal/cachegen/typefunctions/formats/`](../ts-go-runtypes/internal/cachegen/typefunctions/formats/))
write one independent `if (fail) push(...)` per constraint, with the constraint
name and value known at emit time:

| Failure                | `format.name` | `formatPath` (key) | `format.val`        |
| ---------------------- | ------------- | ------------------ | ------------------- |
| base type-shape        | *(none)*      | `type`             | —                   |
| string `minLength`     | `stringFormat`| `minLength`        | the bound (`2`)     |
| string `maxLength`     | `stringFormat`| `maxLength`        | the bound (`60`)    |
| string `pattern`       | `stringFormat`| `pattern`          | a message¹          |
| number `min`/`max`     | `numberFormat`| `min` / `max`      | the bound           |
| number `lt`/`gt`       | `numberFormat`| `lt` / `gt`        | the bound           |
| number `integer`       | `numberFormat`| `integer`          | `true`              |
| datetime `date`/`time` | `dateTime`    | `date` / `time`    | *(none)*            |
| datetime `splitChar`   | `dateTime`    | `splitChar`        | the separator       |
| `Date` bound           | `nativeDate`  | `min` / `max`      | *(none)*¹           |
| `uuid` version         | `uuid`        | `version`          | `'4'`               |

¹ See **`$[val]` enrichment** under Prerequisites — `val` is currently overloaded
(a *message* for `pattern`/`allowedChars`, *absent* for date bounds). The
enrichment makes `$[val]` resolve uniformly to the declared bound.

**Constraint granularity is bounded by the type — and the type ENFORCES it.**
A bare `name: string` can only fail as `type`; you only get `minLength`/`maxLength`
keys because the field is `FormatString<{minLength; maxLength}>`. The typing is
param-precise: `ErrorTemplates<F>` reads the field's `__rtFormatParams` brand and
derives the exact key set — every failable param is a REQUIRED key (blank `''` =
no custom message), an unknown key is an excess-property error (FT003 moves into
the IDE), count-bearing keys accept a plural object, and non-failing params
(`isCurrency` + the transformers `trim`/`lowercase`/`uppercase`/`capitalize`/
`replace`/`replaceAll` — the `NonFailingParams` union in
[`friendlyType.ts`](../packages/run-types/src/enrich/friendlyType.ts), mirrored
by `nonFailingParams` in [`ts-go-runtypes/internal/enrichment/enrich.go`](../ts-go-runtypes/internal/enrichment/enrich.go))
never become keys. The richness of the friendly map is a function of how richly
the type is annotated.

### Aggregation: errors accumulate

`createGetValidationErrorsFn` **accumulates** — a value that violates `minLength`
*and* `pattern` produces two `RTValidationError`s, not one. (The boolean `createValidateFn`
path short-circuits; irrelevant here.) The only short-circuits are structurally
necessary: no separator ⇒ datetime skips `date`/`time`; no `@` ⇒ email skips
`localPart`/`domain`. So the data DSL yields **one message per violated
constraint** (a list). For one sentence per field regardless of which rule fired,
use the exclusive `rt$default` mode below.

### Placeholder DSL

Templates are plain strings with `$[…]` tokens, validated by the compiler:

- `$[label]` — the node's `rt$label`, falling back to the raw field name.
- `$[val]`   — the failed constraint's parameter (`error.format.val`; see enrichment).
- `$[path]`  — dotted path to the field.
- `$[index]` — array element index, for `rt$items` failures.

Two template extensions shipped with the i18n layer — both validated by `enrich --no-emit`,
both legal in single-locale maps too:

- **Plural templates.** A **count-bearing** constraint (`minLength` / `maxLength` /
  `min` / `max` / `lt` / `gt` — the shared `CountBearing` table in
  [`ts-go-runtypes/internal/enrichment/classify.go`](../ts-go-runtypes/internal/enrichment/classify.go), read by emitter
  and checker alike so they can never disagree) may carry a plural OBJECT instead
  of a plain string: `minLength: {one: '…', other: '…'}`. Arm keys are CLDR
  cardinal categories; only `other` is mandatory (FT006); `enrich` scaffolds the arm
  set of the source locale (tsconfig `i18n.sourceLocale`, default `en` — built-in
  CLDR table in [`ts-go-runtypes/internal/enrichment/cldr/`](../ts-go-runtypes/internal/enrichment/cldr/) covering
  en/es/zh/hi/ar/pt/ru/ja/de/fr/pl, all six categories for any other locale). The
  renderer selects the arm via `Intl.PluralRules` on the **violated bound**
  (`$[val]` — `minLength: 3` pluralizes for 3, NOT the received value's length); a
  non-finite bound selects `other` directly, and plain `createFriendlyText` uses `en`
  rules (deterministic, matching the default `sourceLocale`). A plain string stays
  legal on a count-bearing constraint; `rt$label` is always a plain string.
  Type-side: `TemplateLeaf = string | PluralTemplate` (plus `PluralCategory`),
  exported from `@mionjs/run-types`; the TS `CountBearingKeys` union in
  `friendlyType.ts` mirrors Go's `CountBearing` — the second TS↔Go sync point.
- **Type-driven `$[val]` rendering.** On the `createFriendlyTextI18n` path the
  error's format payload says what the bound IS. A number with the `isCurrency`
  param (`TF.Currency<P>` = `Number<P & {isCurrency: true}>` — pure
  presentation metadata, the only number param with no failable constraint;
  the emitter echoes it onto every error the field produces) renders via
  `Intl.NumberFormat(locale, {style: 'currency', currency})` with the
  app-supplied `currency` renderer option (a string or `{value}` ref; omitted →
  plain localized number, never a guessed symbol); a date-family format NAME
  renders via `Intl.DateTimeFormat(locale)` (an unparseable relative bound like
  `now-P1D` stays verbatim); everything else stays `String(val)`. There is no
  per-template format syntax — the type is the single source of truth. An
  unknown token stays verbatim, a literal colon in prose (`ratio 3:1`) is never
  touched, and `Intl` instances are memoized (`PluralRules` per locale; bound
  formatters per locale + currency / style).

`$[value]` (the *actual received value*) is out of scope for v1: the error carries
no value (`RTValidationError` is `{path, expected, format?}`), so it would require
threading the input into the renderer. Revisit with the `$[val]` enrichment.

### `rt$default` — the exclusive catch-all mode

A node's `rt$errors` is one of exactly two shapes: the per-constraint record, or
`{rt$default: '…'}` — a single template that yields ONE message for the whole
field, whatever failed (a field that violates several constraints under a
`rt$default` node still renders exactly one message, not one per constraint).
The two are **mutually exclusive** (`rt$default` beside any other key is both a TS
excess-property error and a Go checker Error), enforced as a union of the two
record types. `rt$default` is plain data, so it stays translatable and
reconcilable; there is NO function-form `rt$errors` (an inline arrow was the v1
escape hatch — removed: opaque to translation, reconcile and the checker).

Which mode `enrich` scaffolds for a NEW node is the tsconfig plugin entry's
top-level `friendlyErrors` knob (`"perConstraint"` default | `"default"`). Once
a node exists its authored mode is author-owned: every later sync follows it,
and a `rt$default`-only node is never descended by the `rt$errors` reconcile.

### Type sketch — modelled on `DataOnly<T>`

Both DSL types are recursive mapped types over `T`, and should follow the
construction in
[`dataOnly.ts`](../packages/run-types/src/runtypes/dataOnly.ts) (`#region
dataonly-extract`) — this repo's reference for a *cheap* recursive type. The
codebase is acutely sensitive to TS instantiation cost (see the
[markers.ts](../packages/run-types/src/markers.ts) note on the
~700-instantiation tuple-intersection trap).
Three rules carried over from `DataOnly`:

1. **Depth-bounded** via a tuple-decrement budget, so circular / mutually-recursive
   types resolve to a finite instantiation instead of tripping the TS2589 depth cap.
2. **No `infer` on the hot path** — reach element/property types with `T[number]`
   and `T[K]`, behind cheap bare `extends` gates ordered scalar-before-object.
3. **Homomorphic** `{ [K in keyof T]-?: … }` to preserve structure for free
   (`-?` because the map is TOTAL — every field of the type must be addressed).

And like `DataOnly`, these should live in their own module as a self-contained,
verbatim-sliced region with a per-branch **instantiation-budget** compile test
(mirroring `test/types/dataonly.compile.test.ts`).

```ts
type TemplateLeaf = FriendlyTemplate | PluralTemplate;   // plural only on count-bearing keys

// Param-precise: the leaf arm threads the FIELD's own type F; its
// `__rtFormatParams` brand decides the exact key set. Two exclusive modes:
type ConstraintTemplates<P> = { type: FriendlyTemplate } & {
  [K in Exclude<keyof P & string, NonFailingParams>]: K extends CountBearingKeys ? TemplateLeaf : FriendlyTemplate;
} & { rt$default?: never };
type DefaultOnlyTemplates = { rt$default: FriendlyTemplate; type?: never };
export type ErrorTemplates<F = never> = /* bare `type`-only ⋁ DefaultOnly ⋁ Constraint<P> — see friendlyType.ts */ …;

interface FriendlyMeta<F = never> { rt$label: string; rt$errors: ErrorTemplates<F> }  // BOTH required
type FriendlyLeaf = string | number | boolean | bigint | null | undefined | Date | RegExp;
type _Depth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

type FriendlyNode<T, Depth extends number = 8> =
  Depth extends 0                ? FriendlyMeta                    // budget spent — keep as leaf
  : T extends FriendlyLeaf       ? FriendlyMeta<T>                 // leaf — F drives the rt$errors keys
  : T extends readonly unknown[] ? FriendlyMeta & { rt$items: FriendlyNode<T[number], _Depth[Depth]> }
  : T extends object             ? FriendlyMeta & { [K in keyof T]-?: FriendlyNode<T[K], _Depth[Depth]> }
  :                                FriendlyMeta;                   // (real impl adds Map/Set/tuple arms)

export type FriendlyText<T> = FriendlyNode<T>;
```

### Runtime API — pure-data now, UI deferred

Error rendering needs only `(map, errors)` — index the map by `error.path`, pick
the template by the `formatPath` tail, interpolate. No type id, no `rtUtils`
lookup:

```ts
const friendly = createFriendlyText<User>(friendlyUser);
friendly.errors(getUserErrors(badInput));   // → [{ path: 'profile.email', label: 'Email', message: 'Enter a valid email address' }]
friendly.label('profile.email');             // → 'Email'
```

Localized rendering wraps the same walk: `createFriendlyTextI18n<T>(source, { locale,
translations, currency? })` returns the identical `FriendlyRenderer`, resolving the
locale by naive BCP-47 truncation and falling back **per leaf** to the source map
(the source `FriendlyText` IS the source language — a partial translation never
throws). See [Translations (i18n)](#translations-i18n).

**UI form-building is deferred and *does* need the runtype.** To enumerate every
field of `User` (labelling the ones in the map, falling back to raw names for the
rest, in declaration order) the runtime must read the type's field set — i.e. the
reflection node, fetched by injecting the type id and looking it up in `rtUtils`,
exactly as [`getRunTypeId<T>()`](../packages/run-types/src/markers.ts) does. We
ship `createFriendlyText` **pure-data** first; the runtype pairing lands with the UI
feature — joined at the call site (committed friendly import + `getRunTypeId<T>()`),
no new registry needed (see [Consumption](#consumption--committed-imports)).

---

## `MockData<T>`

### Node model

Per-field pools, ranges, and per-format hints that feed the **existing**
`createMockDataFn<T>()` generator (`createMockDataFn` already supports custom pools and
per-property overrides — `MockData<T>` is just the typed, validated form of those):

```ts
const mockUser: MockData<User> = {
  name:  { pool: ['Alice Martin', 'Liang Wei', 'Fatima Noor', /* …50+ */ ] },
  age:   { min: 18, max: 95 },
  tags:  { rt$items: { pool: ['urgent', 'beta', 'vip'] }, rt$length: [1, 4] },
  profile: {
    email: { pool: ['alice@example.com', 'liang@corp.io', /* … */ ] },
    score: { min: 0, max: 100 },
  },
};

const newUser = createMockDataFn<User>(undefined, { data: mockUser });   // existing factory + the `data` option
```

### The pool-validation superpower (MD003)

Because RunTypes can **validate**, the compiler checks that **every pool / range
value actually satisfies its field's type and format**. An LLM that hallucinates a
malformed email into the `email` pool, or a `score` of `150`, is caught at parse
time — not at test runtime. No other mock library can do this; it falls straight
out of the existing validator.

### Type sketch

Same construction as `FriendlyText` above — depth-bounded, `infer`-free, scalar
gates before the object branch, structure-preserving homomorphic map (see the
`DataOnly` reference there):

```ts
type _MockDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

type MockNode<T, Depth extends number = 8> =
  Depth extends 0                ? { pool?: T[] }                  // budget spent — keep as leaf pool
  : T extends readonly unknown[] ? { rt$items?: MockNode<T[number], _MockDepth[Depth]>; rt$length?: number | [number, number] }
  : T extends number             ? { pool?: number[]; min?: number; max?: number }
  : T extends string             ? { pool?: string[] }
  : T extends object             ? { [K in keyof T]?: MockNode<T[K], _MockDepth[Depth]>; rt$optional?: number }
  :                                { pool?: T[] };

export type MockData<T> = MockNode<T>;
```

---

## Validation — the `enrich --no-emit` mode (build surfacing deferred)

> **Most drift is already caught by TypeScript itself.** Because `FriendlyText<T>`
> / `MockData<T>` are *precise* mapped types, the user's own type-checker rejects
> the bulk of drift with no Go pass at all: a renamed/removed field makes the map
> key an excess property (editor error), and an object-vs-scalar shape mismatch is a
> type error (both proven by the P1 instantiation-budget tests). So the Go pass
> below is a **refinement layer** — it adds only what the type system can't see:
> constraint-key existence (FT003 — the `rt$errors` record has an index signature, so
> TS accepts any key), `$[…]` placeholder validity (FT005), mock pool-value
> validation (MD003), and the semantic-drift hash (FT010/MD010). The feature is
> already useful with just the types + the editor; the pass sharpens the diagnostics.

**Implemented today as the `enrich --no-emit` CLI mode** (not yet the Vite build). It finds
`FriendlyText<T>` / `MockData<T>` const declarations, resolves `T`'s `RunType`, and
runs a **kind-switch paired walk** of the authored object-literal against the
`RunType` — the emitter convention, in
[`ts-go-runtypes/internal/enrichment/validate.go`](../ts-go-runtypes/internal/enrichment/validate.go) over a tiny
`LiteralView` adapter (so the checks are unit-testable without a Program). Wired
diagnostics: **FT002, FT003, FT005, MD001** (the others below are deferred).

The **always-on build version is the deferred integration**: recognize the
annotation as one more marker arm during the normal scan and emit on the existing
`Diagnostic[]` channel so findings surface in Vite/HMR like today's `VL0xx` warnings
— a **new shape-aware comptime axis** (`ShapeCheckedArgs<T>`) where `CompTimeArgs`
today only checks *literalness* but this also cross-references the literal's keys
against `T`'s children and formats. The walk logic is identical to `enrich --no-emit`; only the
trigger differs (CLI vs build scan).

### `FriendlyText` diagnostics

| Code      | Severity | Status | Meaning                                                                       |
| --------- | -------- | ------ | ---------------------------------------------------------------------------- |
| **FT002** | Error    | ✅ `enrich --no-emit` | key is not a field of `T` — stale (field renamed/removed)              |
| **FT003** | Warning  | ✅ `enrich --no-emit` | `rt$errors` key isn't a constraint this field's format declares (Go has `FormatAnnotation.Params`, so the exact set is known) |
| **FT005** | Warning  | ✅ `enrich --no-emit` | unknown `$[…]` placeholder for this constraint/context — covers each plural ARM's placeholders; any leftover colon-form `$[val:kind:name]` token (the REMOVED named-format syntax) is flagged with a pointer to plain `$[val]` |
| **FT006** | Error    | ✅ `enrich --no-emit` | plural template missing the mandatory `other` arm (the render backstop) |
| **FT007** | Warning  | ✅ `enrich --no-emit` | plural arm key is not a CLDR cardinal category (`zero`/`one`/`two`/`few`/`many`/`other`) |
| **FT008** | Warning  | ✅ `enrich --no-emit` | plural object on a non-count-bearing constraint — dead arms, only `other` ever renders; use a plain string |
| **FT009** | Error    | ✅ `enrich --no-emit` | `rt$default` beside any other `rt$errors` key — the catch-all and per-constraint modes are mutually exclusive |
| **FT011** | Error    | ✅ `enrich --no-emit` | a property of `T` is named `rt$…` — collides with the reserved enrichment meta prefix (`enrich` refuses such a type up front) |
| **FT001** | Info     | deferred | field of `T` has no label (renders the raw name)                       |
| **FT004** | Error    | deferred (TS catches) | structural mismatch (object node where `T` is scalar)     |
| **FT010** | Info     | deferred | `T`'s structural id changed since authored — review for semantic drift |

### `MockData` diagnostics

| Code      | Severity | Status | Meaning                                                            |
| --------- | -------- | ------ | ----------------------------------------------------------------- |
| **MD001** | Error    | ✅ `enrich --no-emit` | key is not a field of `T`                                      |
| **MD011** | Error    | ✅ `enrich --no-emit` | a property of `T` is named `rt$…` — the reserved enrichment meta prefix (`enrich` refuses such a type up front) |
| **MD002** | Error    | deferred (TS catches) | structural mismatch                               |
| **MD003** | Error    | deferred (needs validator) | a pool/range value **fails validation** against the field's type/format |
| **MD004** | Warning  | deferred | `min > max`, or `rt$length` inverted                              |
| **MD005** | Info     | deferred | pool below a configured floor (e.g. `< 50`) — off by default     |
| **MD010** | Info     | deferred | structural drift since authored                                 |

### Drift detection (FT010 / MD010)

Structural diagnostics catch field renames/removals, but not *semantic* drift
("shape unchanged, meaning moved"). Stamp each generated artifact with `T`'s
structural-id hash in a header comment; the normal scan compares it to the live
type and emits an Info nudge when they differ. LLMs retrieve all of these via the
CLI (below) rather than scraping editor output.

---

## CLI surface

| Command                                         | Purpose                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ts-runtypes enrich [<dir>] --no-emit`                     | Walk the mirror tree for breadcrumb + location drift; non-zero exit on Error. CI / pre-commit. |
| `ts-runtypes enrich <file> --no-emit --json`               | Validate **one file** (tag hygiene, content, drift), structured JSON out. The agent's tight feedback tool. |
| `ts-runtypes enrich <file> [--mock] [--friendly] [--update] [--prune]` | Generate / refresh the type's mirror file under `genDir`. `--update` reconciles an existing mirror value-preservingly (property merge + rename + orphan); `--prune` strips `@rtOrphan`/`@rtOrphanChild` carcasses (the only destructive op). Breadcrumb drift now lives under `enrich --no-emit`. See `enrich` semantics below. |
| `ts-runtypes enrich --i18n <locale>` (or `all`) `[--update] [--prune] [<src.ts>]` | Scaffold (create-only) / reconcile / prune a locale's `FriendlyText<T>` mirrors — generated from the SOURCE TYPE with the same driver as the friendly mirror (locale-parameterized); `all` fans out over tsconfig `i18n.locales`; without `<src.ts>` targets are discovered as "sources that have a friendly mirror" (path math only — the mirror is never read as an input). See [Translations (i18n)](#translations-i18n). |
| `ts-runtypes enrich --i18n <locale> --no-emit` (or `all`) | Translation completeness gate for CI (**TR001–TR004**) — Warnings, promoted to Errors by tsconfig `i18n.strict`. |

Both run as out-of-band CLI modes of the Go binary (an opt-in bundler-plugin option
can additionally drive the mechanical scaffold + sync — not translation, not the LLM
step — in dev/watch). Validation runs via `enrich --no-emit` (CI / agents); surfacing
the same FT/MD diagnostics *always-on during a Vite build* is the deferred integration
(see Validation below).

### The agent loop — the compiler as a tool for the LLM

```
enrich ./models/user.ts#User  ──►  agent writes/patches the mirror file  ──►  enrich --file <mirror> --no-emit --json
   ▲                                                                          │
   └─────────────────────────  loop until clean  ◄────────────────────────────┘
                                       │
                        human reviews the diff, commits
```

`enrich --file --no-emit --json` is the ground-truth
correctness check. The Go binary already runs as a long-lived process under the
plugin, so `enrich --file --no-emit` is a cheap incremental op. The same two ops are exactly
what you'd expose as **MCP tools** so any agent (Claude Code, Cursor, your own)
can drive generation, vendor-neutral.

### Process model — where each command runs (decided)

**No new binary, all Go-side, CLI-arg-driven.** `enrich` / `enrich --no-emit` are
new **command-line modes** of the existing binary (`main.go` is flag-only today —
add subcommand/positional dispatch). They are primarily **out-of-band, one-shot
commands a developer or agent runs deliberately** — though an **opt-in
bundler-plugin option** can drive the same mechanical scaffold + sync (no
translation content) in dev/watch. By default the Vite resolver process is
untouched and writes no enrichment files; "build time" is the wrong label for the
LLM-backed generation.

- **The `enrich` codegen emitter lives in Go.** It walks the `RunType` graph — a giant
  `switch` over `RunType.kind`, the same emitter pattern as
  [`serialize.go`](../ts-go-runtypes/internal/cachegen/runtype/serialize.go) and the typefns
  families — and **emits new mirror files under `genDir` or appends to existing
  ones**. Keeping it Go-side reuses that walk; doing it in JS would mean shipping the graph to Node and
  re-implementing the kind-switch — duplicating the emitter for nothing. Because
  `enrich` is one-shot (not a tight loop), paying the `Program` build per invocation is
  fine — it builds, walks, writes, exits.
- **`enrich --no-emit` is the same kind-switch walk** (output: JSON
  / diagnostics rather than files). Today it is a one-shot CLI run (build, walk,
  emit, exit). For a tight agent loop that wants it fast and repeated, keeping one
  warm `Program` alive across calls is the natural optimization — planned as exposing
  the verb over the same `serve` protocol the bundler plugin already drives (so the
  warm resolver serves it without a fresh build per call). `enrich --no-emit`'s analysis is the
  *same* validation the always-on scan runs during a real Vite build; the CLI just runs
  it standalone.
- **Public surface stays in the npm package** via a thin `ts-runtypes` bin that
  shells to the Go binary — per CLAUDE.md ("the JS packages are the only public
  surface") — but the *logic* (the emitter, the walk, file I/O) is Go.

(Earlier draft split file-writing onto the JS side; superseded — the emitter is a
`RunType.kind` switch, so it belongs in Go with the other emitters.)

**Never call an LLM inside a build.** Builds stay pure and deterministic. Any
LLM-backed generation is an explicit, opt-in CLI/agent action that writes a
reviewable diff; results are always committed and human-reviewed.

---

## Storage — the mirror directory

Enrichment is stored in a committed **mirror directory** whose tree shadows your
source tree, **one subtree per artifact family**: a type defined in
`<rootDir>/models/user.ts` gets its friendly map in
`<genDir>/enriched/friendly/models/user.ts` and its mock data in
`<genDir>/enriched/mock/models/user.ts`. Storage is anchored to the **type's definition**
(not its call sites) — the committed analog of the cache's *one canonical entry per
type* rule: **one enrichment home per type per family, at its definition**, however
many files consume it. A mirror tree (rather than `.rt.ts` siblings interleaved
with source) keeps generated, committed artifacts out of the hand-authored source
tree entirely.

```
<rootDir>/models/user.ts          interface User { … }          ← definition
<rootDir>/services/userApi.ts     createMockDataFn<User>()        ← consumer
<rootDir>/test/fixtures.ts        createMockDataFn<User>()        ← consumer
                                  ──────────────────────────────────
enrich ⇒  <genDir>/enriched/friendly/models/user.ts   export const friendlyUser: FriendlyText<User> = { … }
          <genDir>/enriched/mock/models/user.ts       export const mockUser:     MockData<User>     = { … }
                                  (ONE mirror file per family, at the definition's mirror path)
```

### Configuration — the tsconfig `plugins` entry

Global settings live in a `ts-runtypes` entry under `compilerOptions.plugins` in
`tsconfig.json` — the natural home for project-wide type-tooling config, and where
tsgo already looks:

```jsonc
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "ts-runtypes",
        // mirrors live by convention under <genDir>/enriched (genDir default: src/__runtypes)
        "moduleMode": "default",
        "emitMode": "code",
        "inlineMode": "default"
      }
    ]
  }
}
```

Precedence is **CLI flag > tsconfig entry > built-in default**. `genDir` defaults
to `<genDir>/enriched`; the mirror path for a type is
`<genDir>/enriched/<family>/<declFile relative to rootDir>` with `family` = `friendly` |
`mock`. The optional `i18n` object under the same entry configures the translation
layer ([Translations (i18n)](#translations-i18n)) and is dormant when absent.

### Algorithm

- **Demand discovery — global.** Scan all call sites across the project.
- **Output location — the definition's mirror.** For each demanded *named* type `T`,
  resolve `T` to its declaration's source file `F` (following re-exports to the
  original), compute `F`'s per-family mirror paths under `genDir`
  (`friendly/<rel>` / `mock/<rel>`), and write/refresh them.

One mirror file per source file **per family** holds one export per enriched type
defined there — `friendly<Name>` consts in the `friendly/` subtree, `mock<Name>`
consts in `mock/`, each family file importing only its own wrapper type:

```ts
// src/__runtypes/enriched/friendly/models/user.ts — GENERATED, COMMITTED, hand-editable.
import type { User, Post } from '../../../../models/user';
import type { FriendlyText } from '@mionjs/run-types';

export const friendlyUser: FriendlyText<User> = { /* … */ };
export const friendlyPost: FriendlyText<Post> = { /* … */ };
```

```ts
// src/__runtypes/enriched/mock/models/user.ts — same source, the mock family's mirror.
import type { User, Post } from '../../../../models/user';
import type { MockData } from '@mionjs/run-types';

export const mockUser: MockData<User> = { /* … */ };
export const mockPost: MockData<Post> = { /* … */ };
```

This is the **first committed RunTypes artifact** — every other output is gitignored
cache. The `import type { … }` line is a **real, IDE-managed import** pointing back
at the source file (strictly `import type`, so no value-level cycle source→mirror→
source can form); it is best-effort — if a consumed type isn't exported, the
generated file simply fails to compile and the user fixes the export. That same
`import type` line doubles as the **breadcrumb** for drift detection (see
[`enrich` semantics](#enrich-semantics)).

**Migrating a pre-split combined mirror.** A legacy mirror (one file at the
no-family path holding both `friendly*` and `mock*` consts) is migrated
automatically — once — by the next `enrich` run over its source: every const, marker,
hand-written comment and `@rtOrphan` carcass is carried VERBATIM into its family's
file, the source breadcrumb is recomputed for the one-directory-deeper location
(cross-mirror value-import specifiers are untouched — both endpoints move down one
family segment, so the relative path between two mirror files is unchanged), and
the legacy file is deleted (`SplitCombined` in
[`ts-go-runtypes/internal/enrichment/mirror/split.go`](../ts-go-runtypes/internal/enrichment/mirror/split.go)). The
guards are conservative: the legacy file's breadcrumb must resolve back to the
same source, and an existing family file is never overwritten (a stderr warning
asks for a hand-merge instead). Until migrated, `enrich --no-emit` flags a combined
mirror as **GE001** location drift. `--out <path>` keeps the old combined
single-file layout as an explicit escape hatch.

### Named-type-driven emission (decided)

Generation is driven by **type names** — the same principle as the cache (*one entry
per named type*). An inlined/anonymous type cannot own a `const`, so the split of the
emitted output mirrors the **named-type** structure:

- **Each named type → its own `const`** (`friendly<Name>` / `mock<Name>`). A field
  whose type is *another named type* is a **reference by name**, not an inlined copy.
  When that type is defined in another source file, the reference is a cross-file
  value `import` from its mirror file (`import { friendlyAddress } from
  '../models/address'`) — this is why `declFile`
  ([Prerequisites](#prerequisites-on-the-existing-system)) is **required**, not
  deferred. Within one file (e.g. a test fixture declaring several interfaces) the
  references are intra-file const references, no imports.
- **Anonymous / inline shapes are inlined** into their parent const (no name → no const).
- **Cycles break at the back-edge.** Emit named consts in dependency (topological)
  order; a back-edge to an already-in-progress named type becomes a **leaf node**
  (friendly `{rt$label:''}`, mock `{}`) so the const graph never hits a TDZ self-reference.

```ts
// interface A { id: string; b: B }   interface B { id: string; a: A }
export const friendlyB: FriendlyText<B> = {rt$label: '', id: {rt$label: ''}, a: {rt$label: ''}}; // back-edge → leaf
export const friendlyA: FriendlyText<A> = {rt$label: '', id: {rt$label: ''}, b: friendlyB};     // forward ref
```

### Structural node shapes (solution A)

The emitter **reflects type structure at the node level too** — composite kinds are NOT
collapsed to opaque leaves. New DSL shapes (the `FriendlyText<T>`/`MockData<T>` mapped
types model the same):

| Kind | friendly node | mock node |
| --- | --- | --- |
| tuple `[A, B]` | `{rt$label?, rt$slots: [node, node]}` | `{rt$slots: [node, node]}` (fixed length, no `rt$length`) |
| `Map<K,V>` | `{rt$label?, rt$keys: node, rt$values: node}` | `{rt$keys: node, rt$values: node, rt$size?: [min,max]}` |
| `Set<U>` | `{rt$label?, rt$values: node}` | `{rt$values: node, rt$size?: [min,max]}` |
| index sig `{[k]:V}` | `{rt$label?, rt$values: node}` | `{rt$values: node, rt$size?: [min,max]}` |
| array `U[]` | `{rt$label?, rt$items: node}` | `{rt$items: node, rt$length?}` |

Tuples use **`rt$slots`** (per-slot, homomorphic `{[K in keyof T]: node}`) — the correct
reflection of a fixed tuple — distinct from arrays' `rt$items`/`rt$length`. Map/Set/index-sig
get `rt$keys`/`rt$values`/`rt$size`. This supersedes the earlier leaf-pool divergence: the
emitter and the DSL types now agree structurally for every kind.

### Trigger policy

| Artifact         | Generated for…                                                              |
| ---------------- | --------------------------------------------------------------------------- |
| `FriendlyText<T>`| **any** type referenced by **any** RunTypes marker (broad — friendly also serves future UI, so we scaffold eagerly) |
| `MockData<T>`    | only types consumed by a **`createMockDataFn`** call (demand-driven by the mock consumer) |

### `enrich` semantics

- **Best-effort.** Emits the mirror file + `import type`; broken exports are the
  user's to fix.
- **Create-only by default.** Without `--update`, `enrich` detects existing entries
  (regex on the export name); if present, it **skips** them and appends only
  missing entries. It never rewrites existing content — those files are
  hand-editable and AI-authored. **`--update` opts into reconcile** (below): a
  surgical, value-preserving merge of an existing mirror against the regenerated
  desired set.
- **Stable names — `enrich` never edits hand-authored source.** Once a mirror file
  exists, `enrich` does not rename or relocate it on a source rename, and never touches
  the consumer's `import`. This keeps the "`enrich` only ever writes inside `genDir`"
  property intact (itself part of the persistence invariant: the committed imports
  are the *user's* to own, not `enrich`'s to rewrite).
- **`enrich --no-emit` — drift detection via the breadcrumb.** Each mirror file's
  `import type { … } from '<src>'` is an IDE-maintained breadcrumb: on an IDE-driven
  source rename/move it is auto-updated to the new path, so the consumer's value
  import (pointing at the *mirror* file, which did not move) keeps working — nothing
  breaks. `enrich --no-emit` resolves each breadcrumb and **warns** when a mirror file's
  location no longer matches its source (cosmetic drift), or **errors** when the
  breadcrumb resolves to nothing (the source type was deleted → orphaned mirror) or
  the source no longer declares the type. A non-IDE rename (`git mv`, find/replace)
  leaves a dangling breadcrumb that `enrich --no-emit` flags for a manual `enrich`.

### `enrich --update` — reconcile (value-preserving merge)

`enrich <file> <Type> --update` reconciles an EXISTING committed mirror against the
freshly regenerated desired set, instead of skipping it (create-only) or
clobbering it. It is **mutually exclusive** with `--files` (fatal
if combined) and honors `--out` / `--gen-dir` / `--mock` / `--friendly`. An
empty / missing mirror falls back to the create-only fresh-file path.

The whole point is that mirror files are **hand- and AI-authored** — labels,
error messages, mock pools — so a type change must never wipe that work. The
reconcile parses the existing file, matches it to the desired set, and emits
only the minimal edits.

**Markers** the generator stamps (and the reconcile maintains) — all on the
const *wrapper*, never inside the skeleton body, so they survive Prettier (a
leading JSDoc on a declaration is preserved) and round-trip on the next update:

| Marker | Where | Purpose |
| --- | --- | --- |
| `@rtType <Name>#<id>` | JSDoc on each `export const` | the const's structural type id — the reconcile matches existing↔desired by THIS id, not the positional var name (so `friendlyBox` / `friendlyBox2` never swap bodies) |
| `@rtIds {field: <id>, …}` | same JSDoc | a dotted-field-path → child-type-id map; recovers a primitive/inline field's identity for rename matching |
| `@rtOrphan` | block comment wrapping a whole const | a const whose source type was deleted — a value-preserving carcass |
| `@rtOrphanChild` | block comment wrapping one field | a single removed field — a value-preserving carcass |

The encoding is a single leading line per const:
`/** @rtType User#9f3a @rtIds {name: a1b2, age: c3d4} */` (keys sorted, so output
is deterministic + idempotent). The `@rtIds` value may also be hand-written in
the readable `field: TypeRef#id` form — the parser accepts both; the generator
emits the bare-id form.

**Namespace rule — `@rt`-prefixed tags are compiler-owned.** Every `@rt*` JSDoc
tag (`@rtType`, `@rtIds`, `@rtOrphan`, `@rtOrphanChild`) is machinery
the compiler *reads, writes, and acts on*. A separate **plain `@todo`** is emitted on a line of
its own directly above the `export const` of each **newly-generated** const (right
after the `@rtType`/`@rtIds` marker line):

```ts
/** @rtType User#9f3a @rtIds {name: a1b2} */
// @todo: generated skeleton — fill in real data, then delete this line
export const friendlyUser: FriendlyText<User> = { … };
```

It is deliberately **outside** the `@rt` namespace — a bare `//` line comment, not
`@rtTodo` — because the compiler *only emits* it: filling in the real data and
deleting the line is the AI's/user's job. It is the manual v1 hook for flagging
"needs real data" (and earns free IDE TODO-panel recognition). The compiler never
processes, auto-removes, or re-adds it: `--update` of an already-existing const
leaves its `@todo` untouched (a const you already cleared never regrows one), and
`--prune` ignores it entirely (it strips only `@rtOrphan`/`@rtOrphanChild`). It
rides the const **wrapper**, never the skeleton body, so the batch generation path
is byte-identical.

**Hand-authored comments are preserved across `--update`.** A leading `//` or
`/* */` comment you wrote above a field (or const) survives the reconcile, and
**travels with a renamed field** — a Tier-1 named-type rename or a Tier-2 primitive
rename carries the comment to the new key. A comment above a field whose **type
changed** stays above the live (replaced) field; a comment above a **dropped**
field folds *into* its `@rtOrphanChild` carcass, so `--prune` removes it cleanly
instead of leaving it dangling.

**Reconcile algorithm (per mirror file):**

1. **Parse** the existing bytes via the tsgo parser. Any parse diagnostic is
   **fatal** ("cannot parse mirror; fix or delete it") — we never silently
   append to or overwrite a file we cannot parse.
2. **Index** every `export const friendly*/mock*` by `(@rtType id, form)` — the
   friendly + mock consts of one type share a structural id, so the form
   disambiguates — with a var-name fallback (a field add/remove changes the id,
   but `friendly<Name>` is stable). Imports + `@rtOrphan` carcasses are indexed
   too.
3. **Match** consts by `@rtType` id (fallback var name). A new desired const →
   ADD (or RESTORE an `@rtOrphan` carcass for that id). A matched const → property
   merge. The stale marker is refreshed to the new id + `@rtIds` so the next run
   matches by id again.
4. **Property merge** (recursive, keyed by field name): a field present in both
   as a **leaf** is left byte-identical (the authored value + formatting
   survive); both as **objects** recurse; a desired-only field is **inserted** as
   a fresh skeleton; an existing-only field is **commented out** in place with
   `@rtOrphanChild` (value + trailing comma preserved inside the block comment).
5. **Rename pass** (runs first, over the raw drop/add sets): pair a dropped field
   with an added one that share a **unique** child identity — Tier 1 is the
   `friendly*/mock*` reference name (named-type fields), Tier 2 is the `@rtIds`
   child id (primitive/inline fields). A unique match emits a **key-only splice**
   (the old value is carried verbatim under the new name); an identity shared by
   more than one drop or add is ambiguous → no rename, fall through to
   orphan-child / insert.
6. **Orphan-const** (conservative): an existing owned const that is BOTH absent
   from the desired set AND whose source type is no longer declared by the
   resolved breadcrumb source is wrapped in `@rtOrphan`. The "no longer declared"
   check is what distinguishes a deleted type from one merely outside this
   invocation's closure (another type in the same mirror file is left untouched).
7. **Import sync**: missing cross-file value imports are added; the breadcrumb
   `{ … }` clause is recomputed from the surviving + desired type names declared
   in this file and replaced **in place** — `from '<src>'` is **never rewritten**
   (that is an `enrich --no-emit` concern, and the breadcrumb is the user's IDE-managed
   link).

All edits go through a purpose-built **splicer**: `{start, end, text}` ops sorted
strictly descending by start, applied against the original bytes, never merging
touching ranges, **fatal on any overlap**. Trivia-trimmed statement starts
(`scanner.GetTokenPosOfNode`) keep a comment above a const from being swallowed.

**Idempotency is AST-structural, not whitespace-collapse:** an unchanged const —
even one a developer ran Prettier over — produces zero splice ops, so a re-run is
a **byte-identical no-op**. (The merge compares field-key sets via the parsed
AST; it never touches a leaf's bytes, so whitespace inside string/template
literals can never fool it.)

### `enrich --prune` — the only destructive op

`enrich --prune [<mirror-file-or-dir>]` strips every `@rtOrphan` / `@rtOrphanChild`
comment (whole-const carcasses and inline dropped-field carcasses alike) and the
commented-out code they carry, reporting what was removed per file. It is the
**only** path that truly deletes content — the reconcile only ever *comments
out*, so a dropped field/const can be reviewed (and restored on reappearance)
before a deliberate prune sweep removes it for good. It is idempotent: a file
with no carcasses is left untouched.

### Translations (i18n)

The friendly family translates per locale — [Translations (i18n)](#translations-i18n)
carries the full design; this is the mirror-side summary. The tsconfig `i18n`
object is optional (defaults apply when absent — zero change for a project that
never translates), and the source `FriendlyText` map IS the source language (no
separate default catalog) — anything unfilled falls back to it at render time.

```
ts-runtypes enrich --i18n <locale> [<src.ts>]           # scaffold (create-only)
ts-runtypes enrich --i18n <locale> --update [<src.ts>]  # reconcile from the SOURCE TYPE
ts-runtypes enrich --i18n <locale> --prune  [<src.ts>]  # strip @rtOrphan carcasses (the only delete)
ts-runtypes enrich --i18n all [--update]                # fan out over tsconfig i18n.locales
ts-runtypes enrich --i18n <locale|all> --no-emit        # completeness gate (CI)
```

Without `<src.ts>`, targets are "sources that have a friendly mirror" — derived
by path math from the files under `<genDir>/enriched/friendly/`; the mirror's CONTENT
is never an input. **One driver, one desired-state source:** a locale file is
generated by the same EmitClosure walk (over the checker Program) as the
friendly mirror itself, parameterized by const prefix, output path, plural arm
set and sibling-reference renames — no file under `generated/` ever feeds the
generation of another, so the generated dirs can be treated as write-only.

- **Files + naming.** One translation file per friendly mirror per locale:
  `<i18nDir>/<locale>/<rel>.ts`, `i18nDir` being `<genDir>/enriched/i18n`
  (convention, not configurable; the locale is a PATH
  SEGMENT, so `pt-BR` works verbatim). Each source `friendly<Name>` gets a
  `<locale>_friendly<Name>` const (BCP-47 `-` becomes `_`: `pt_BR_friendlyUser`),
  annotated `FriendlyText<Name>` — the SAME type as the source map — carrying
  the same `@rtType <Name>#<id>` / `@rtIds` markers. The path and const prefix
  carry the locale; there is no `@rtI18n` marker.
- **The scaffold is the type's tree, blank.** Every `rt$label`, string template
  and plural arm is an `@todo` blank (`''`) — "never copy source text as if
  translated" is true by construction (the type has no strings). Plural objects
  carry the TARGET locale's CLDR arm set; const references rename to their
  locale siblings (`home: pl_friendlyAddress`).
- **The `rt$errors` descent is the ordinary reconcile.** Every friendly-family
  file (source mirror and each locale) gets the same value-preserving reconcile
  with the same one-level `rt$errors` descent: a newly declared constraint key
  arrives as a blank of the right kind (plural keys with THAT FILE's locale
  arms); a dropped RECOGNIZED constraint key becomes an `@rtOrphanChild`
  carcass (unknown keys are author-owned and untouched — TS flags typos as
  excess properties); a same-key leaf stays byte-identical; a `rt$default`-only
  node is skipped entirely (its authored mode is respected). Type renames carry
  across locales via the shared `@rtType` id (const, annotation, marker and
  intra-file references are renamed in place).
- **Plural arms are LOCALE-OWNED.** Never orphaned, never rename-paired, never
  down-scoped; a translator-pruned arm stays pruned — only the mandatory
  `other` backstop is ever re-inserted.
- **`enrich --i18n --no-emit` findings:** **TR001** missing translation file, **TR002**
  unfilled `@todo` blanks, **TR003** out of date vs the source TYPE (a
  src-driven reconcile would change the file), **TR004** orphan carcasses
  awaiting review / `--prune`. All Warnings (exit 0) unless tsconfig
  `i18n.strict: true` promotes them to Errors (exit 1); the RUNTIME is always
  lenient regardless.
- **Config** rides the same tsconfig plugin entry (zero change when absent):

  ```jsonc
  "i18n": {
    "sourceLocale": "en",              // language the source FriendlyText maps are written in
    "locales": ["es", "pl", "pt-BR"],  // target locales (the source locale is NOT listed)
    "strict": false                    // enrich --i18n --no-emit gate severity (CI)
  }
  ```

Runtime: `createFriendlyTextI18n<T>(source, { locale, translations, currency?,
sourceLocale? })` returns the same `FriendlyRenderer` as `createFriendlyText`. The
`locale` may be a `{value}` ref (re-read on EVERY render — the renderer itself is
not reactivity-tracked, so call `errors()` per render); `resolveLocale` is naive
BCP-47 truncation (exact tag, then subtags dropped right-to-left — `pt-BR` →
`pt` — then any available tag sharing the base language). Fallback is per leaf
(`rt$label` and each `rt$errors` key independently; a plural leaf falls through as a
WHOLE unit, never mixing a target arm with a source arm; a `rt$default` template
translates like any other leaf) — a partial translation never throws.

### Edge cases

| Case                                          | Policy                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Named type in user `.ts`                      | per-family mirror files at its definition's mirror path — the rule      |
| Several types in one file                     | one mirror file per family, one export per type                         |
| Re-exported / `import type` aliased           | follow to the original declaration; the mirror tracks that file         |
| Anonymous/inline `createMockDataFn<{a:string}>()` | no named home → **skip** (no mirror file)                             |
| Generic instantiations `Box<string>` vs `Box<number>` | separate entries in `Box`'s mirror file, one per structural id, name-disambiguated |
| Type declared only in a `.d.ts`               | mirror is always a `.ts` (it holds runtime const values), at the `.d.ts`'s mirror path |
| Existing hand-edited mirror file              | default: create-only — skip present entries, append missing ones, never clobber. `--update`: value-preserving reconcile (property merge + rename + orphan), never clobbers authored values |

### External / library types — a resolution order

A type defined in `node_modules` has no mirror under your `genDir` (the mirror
tree only shadows *your* source). And a dependency might **already ship** enrichment
for its own types — so we must never blindly generate over it. That makes
external-type enrichment a lookup-precedence problem. **Enrichment for `T`, first
match wins:**

1. **`T` defined in your source** → its mirror file under `genDir`. *(generated by `enrich`)*
2. **`T` from a dependency that ships enrichment** → use the library's named enrichment exports. *(read-only — we consume, never generate)*
3. **`T` from a dependency, user opted in** via a `@rtEnrich` JSDoc tag → user-authored override in a configured dir (`rt-overrides/`). *(opt-in only)*
4. **No match** → emit nothing; factories fall back (mock = mechanical `createMockDataFn`; friendly = raw field names).

So **by default we emit nothing for external types** — they land at #4 unless the
library provides (#2) or the user explicitly opts in (#3). Built-ins (`Date`,
`Map`, …) are #4 by nature; `createMockDataFn` already mocks them mechanically.

Two implications:

- **Enrichment becomes part of a library's public API.** A library that wants to
  support this adds `@mionjs/run-types` (for the `FriendlyText`/`MockData` types) and
  exports its enrichment consts as named exports; a consumer imports them directly,
  same as any other library value — no special-casing.
- **The opt-in tag needs an anchor.** The cleanest is a tagged local re-export,
  which gives both the opt-in signal and a stable import:

  ```ts
  /** @rtEnrich */
  export type { Customer } from 'stripe';
  ```

  The tag flips generation on for that type; output lands in the configured override
  dir. (A config array of type names is the alternative if you'd rather not touch
  source.)

---

## Consumption — committed imports

The consumer imports the enrichment const from its mirror file and passes it. Plain,
greppable, IDE-managed code — no injection, no id-routing, no registry:

```ts
import { mockUser }     from 'src/__runtypes/enriched/mock/models/user';
import { friendlyUser } from 'src/__runtypes/enriched/friendly/models/user';

createMockDataFn<User>({ data: mockUser });
const friendly = createFriendlyText<User>(friendlyUser);
```

`createFriendlyText<T>(map)` and `createMockDataFn<T>({ data })` are already **explicit**
in their shipped signatures (the map/data are real arguments), so this model is the
*smaller* change — the engine is untouched; the only new machinery is `enrich`
producing the committed mirror files. `createFriendlyText` stays a pure-data function
(no marker, no type id); `createMockDataFn<T>` keeps its runtype injection (that is the
*ephemeral* cache, correctly invisible), with `data` as the *committed* import.

### Why not inject the link (rejected)

A "magic" variant — `createFriendlyText<User>()` with the map plugin-injected from the
resolved mirror file — was considered and rejected. It violates the
[persistence invariant](#persistence-invariant--committed-artifacts-get-committed-links):
it would hide a committed dependency behind the same invisible channel that carries
ephemeral cache links, so a reader could not distinguish the two. The explicit import
also wins on the lifecycle: it is the *value* import (to the mirror file, which
`enrich`'s stable-names policy never moves) so it survives source renames untouched,
goes to definition, and works under plain `tsc` with no plugin. Injection stays
exclusively for the ephemeral cache.

### Forward note — UI form-building

The deferred form-builder UI wants both a type's friendly map **and** its runtype
node. With committed imports that is still a one-liner: the friendly map arrives via
its import, and the runtype via the existing `getRunTypeId<T>()` reflection (already
keyed by `InjectRunTypeId<T>`). No new registry is needed — the two are joined at the
call site, not through a shared id table.

### Forward note — mock data must not bloat production

Friendly labels/messages belong in the prod bundle (UI); 50+-item mock pools almost
never do. Because consumption is an ordinary `import`, this is handled by **normal
tree-shaking + import hygiene** — keep `createMockDataFn({ data: … })` calls in
dev/test entry points (or behind a dev condition) so the mock pools never reach a
production graph. No special registration-gating mechanism required.

---

## Prerequisites on the existing system

- **Surface the type's declaration file.** Computing the mirror path (and emitting
  cross-file `import type` / value imports) **requires** `declFile` (+ `declName`) on
  the resolved type — not deferred. The binary already reads this internally
  (`symbol.Declarations → GetSourceFileOfNode()`; `declarationPos` in
  [`serialize.go`](../ts-go-runtypes/internal/cachegen/runtype/serialize.go)) but does not serialize
  it — it's the "location" slot the protocol reserves but never populates.
- **`$[val]` enrichment.** `format.val` is overloaded — the param for
  numeric/length constraints, a pre-baked *message* for `pattern`/`allowedChars`,
  *absent* for date bounds. For `$[val]` to resolve uniformly to the declared
  bound, always carry the raw param value and stop overloading `val` with messages.
  A small, localized change to the format-error emit in
  [`ts-go-runtypes/internal/cachegen/typefunctions/formats/emit.go`](../ts-go-runtypes/internal/cachegen/typefunctions/formats/emit.go).
- **No new emit family.** Unlike `validate`/`json`/`binary`, this feature adds **no**
  runtime codegen and nothing on the hot Vite path. The `enrich` skeleton emitter is a
  one-shot CLI walk; there is no per-build emitter, no id-routing, and no registry.
  Keep it out of the `operations` / `typefns.Families` registries.

---

## Decided defaults / out of scope

These were the open small-detail questions; all are now **decided** (none affect the
overall architecture) and documented here:

- **i18n — SHIPPED** (no longer parked; the full design, including the
  src-derived reconcile, is in [Translations (i18n)](#translations-i18n) above). Per-locale
  translation mirrors live under `<genDir>/enriched/i18n/<locale>/`, scaffolded as
  blank-leaf `FriendlyText<T>` consts straight from the source type (source
  text is never copied as if translated, and no generated file feeds another);
  plural error templates are generator-owned (CLDR arms per locale,
  count-bearing constraints only); `createFriendlyTextI18n(source,
  { locale, translations })` renders with per-leaf fallback to the source map;
  `enrich --i18n` / `enrich --i18n --no-emit` drive scaffold, reconcile, and the CI
  completeness gate.
- **`$[value]`** (the actual received value) in templates — needs the input threaded
  into the renderer or added to `RTValidationError`. Revisit with the `$[val]` enrichment.
- **Union per-member addressing** (`$members`) — node-level `rt$label`/`rt$errors` only
  for v1.
- **Auto-wire vs explicit** — **explicit committed imports, permanently** (per the
  persistence invariant). The injected/registry "auto-wire" variant was considered
  and rejected; it is not a future phase.
- **`MockData` pool floor** (MD005) — warn-only, threshold configurable, off by
  default.

See [CLAUDE.md](../CLAUDE.md) → "validate contract" for the serializable-data semantics
that bound what the friendly-error layer can describe.
