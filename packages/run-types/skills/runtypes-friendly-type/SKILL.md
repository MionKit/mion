---
name: runtypes-friendly-type
description: Author and use a `FriendlyText<T>` for a RunTypes type — the committed, type-keyed map of human-readable field LABELS + ERROR-MESSAGE templates. Use when writing or editing friendly validation errors, friendly/human-readable field labels, form-builder labels, or a `*.rt.ts` enrichment sibling; when turning `createGetValidationErrorsFn<T>()` output into readable messages via `createFriendlyText<T>(map).errors(...)`; or when an `rt$errors` / `rt$label` / `$[label]` / `$[val]` placeholder template needs writing. Covers the `{ rt$label, rt$errors, ...children }` node shape (total: both meta keys required on every node), the `$[…]` placeholder DSL, the param-precise error-template keys (the failed-constraint name: `type`, `minLength`, `min`, `max`, `pattern`, …), the exclusive `rt$default` catch-all mode, and where the map lives.
---

# Authoring & using `FriendlyText<T>`

`FriendlyText<T>` is one of two **AI-enrichment artifacts** in RunTypes (the other is
`MockData<T>` — see the `runtypes-mock-data` skill). Unlike validators / codecs (pure
functions of the type, recomputed every build, never committed), enrichment is
**authored once, committed, and validated against the type forever after**. The full
design is [docs/AI_ENRICHMENT.md](https://github.com/mionkit/ts-runtypes/blob/main/docs/AI_ENRICHMENT.md).

A `FriendlyText<T>` is a combined, per-field map of:

- **labels** — `rt$label`, a human name for each field (`'Full name'` for `name`);
- **error-message templates** — `rt$errors`, one template per failed constraint.

It is **pure data**. The shipped runtime renderer is
[`createFriendlyText<T>(map)`](https://github.com/mionkit/run-types/blob/main/packages/run-types/src/enrich/createFriendlyText.ts);
it turns `createGetValidationErrorsFn<T>()` output into readable messages. No type-id
injection, no `rtUtils` — error rendering needs only `(map, errors)`.

## When to use it

- You have `createGetValidationErrorsFn<T>()` errors (`RunTypeError[]`) and want
  human-readable messages instead of raw `{ path, expected, format }`.
- You need stable, human field **labels** (form building, error summaries).
- You're scaffolding a type's committed friendly mirror file, or filling a
  locale's translation file (also typed `FriendlyText<T>`, rendered via
  `createFriendlyTextI18n`).

If you only need a boolean pass/fail, use `createValidateFn<T>()` directly — no friendly
map involved.

## What is shipped today vs designed

- **Shipped:** the `FriendlyText<T>` DSL type with the plural types
  (`PluralTemplate`, `TemplateLeaf`, `PluralCategory`)
  ([`friendlyType.ts`](https://github.com/mionkit/run-types/blob/main/packages/run-types/src/enrich/friendlyType.ts)); the
  plural-aware `createFriendlyText<T>(map)` renderer plus `createFriendlyTextI18n`,
  and `resolveLocale`
  ([`createFriendlyText.ts`](https://github.com/mionkit/run-types/blob/main/packages/run-types/src/enrich/createFriendlyText.ts)) —
  all exported from `ts-runtypes`. The `enrich` / `enrich --no-emit` CLI (including `--i18n`)
  scaffolds and validates the committed maps — see the `rt-enrich-types` skill.
- **Designed (not yet wired):** the `ShapeCheckedArgs<T>` compile-time axis and
  `rtUtils` registry accessors.

## The node model — `{ rt$label, rt$errors, ...children }`

One recursive node, uniform at every depth. `rt$`-prefixed keys are **meta**; every
other key is a **child field** (the `rt$` prefix is RESERVED — a source-type property
named `rt$…` is refused by `enrich` and flagged FT011; a plain `$foo` property is just a
field). Leaf nodes simply have no children — there is no `fields:` wrapper.

- `rt$label: string` — the field's human name; always a plain string. REQUIRED.
- `rt$errors` — the field's error templates. REQUIRED. Either the per-constraint
  record or the exclusive `{rt$default: '…'}` catch-all (below). A template leaf
  is a plain string, or on count-bearing constraints a **plural object**
  (`TemplateLeaf = string | PluralTemplate` — see the plural section below).
- Arrays (and rest tuples) carry `rt$items` (the element node); fixed tuples carry
  positional `rt$slots`; `Map` carries `rt$keys` / `rt$values` and `Set` carries `rt$values`.
- Nested objects recurse with the _same_ node shape, every field of `T` present.

**The map is TOTAL.** Every field appears and every node carries both meta keys; a
blank `''` means "no custom text" (the renderer falls back gracefully), so blanks are
always safe. Never delete a key to opt out — the next `enrich --update` scaffolds it
back; one type maps to exactly one shape.

The map's structure is checked against `T` by the `FriendlyText<T>` mapped type:
a missing field, an object node where `T` is scalar (or vice-versa), an unknown
`rt$errors` key — all TYPE errors, caught in the IDE before `enrich --no-emit` even runs.

## `rt$errors` keys = the failed-constraint name

Each `rt$errors` key names the sub-constraint that failed. This is **not** an invented key
set — it maps 1:1 onto what `createGetValidationErrorsFn<T>()` emits. The renderer picks
the template by the error's `(format.name, formatPath-tail)` discriminator:

- `type` — the base type-shape failure (a `RunTypeError` with no `.format`): "this
  isn't even the right kind of value". Always present.
- Format sub-constraints, exactly as the type declares them:
  - string: `minLength`, `maxLength`, `pattern`, `allowedChars`
  - number: `min`, `max`, `lt`, `gt`, `integer`
  - datetime: `date`, `time`, `splitChar`
  - `Date` bound: `min` / `max`; `uuid`: `version`

**The typing is param-precise.** `ErrorTemplates<F>` reads the field's format brand:
every failable declared param is a REQUIRED key (blank `''` = no custom message), an
unknown key is an excess-property TYPE error (FT003's job, moved into the IDE), and
non-failing params never become keys (`isCurrency`, `mockSamples`, and the transformers
`trim` / `lowercase` / `uppercase` / `capitalize` / `replace` / `replaceAll` — the
`NonFailingParams` union in `friendlyType.ts`, mirroring Go's `nonFailingParams`). A
bare `name: string` takes `type` only; a richer friendly map requires a richer type
annotation.

**`rt$default` — the exclusive catch-all mode.** `rt$errors: {rt$default: '…'}` yields
ONE message for the whole field, whatever failed. It never mixes with per-constraint keys
(TS union + FT009 Error). Each node picks its own mode; `enrich` always scaffolds NEW
nodes per-constraint (switch a node to `rt$default` by hand), and once a node
exists its authored mode is followed by every sync.

Errors **accumulate** — a value violating `minLength` _and_ `pattern` yields two
messages (a list), one per violated constraint (a `rt$default` node instead collapses
to a single message for the whole field, no matter how many constraints failed).

## The placeholder DSL

Templates are plain strings with `$[…]` tokens the renderer substitutes:

| Token           | Resolves to                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$[label]`      | the node's `rt$label`, falling back to the raw field name                                                                                                                                                       |
| `$[val]`        | the failed constraint's bound (`error.format.val`; e.g. `2`)                                                                                                                                                    |
| `$[path]`       | dotted path to the field (`profile.email`)                                                                                                                                                                      |
| `$[index]`      | array element index, for `rt$items` failures                                                                                                                                                                    |
| _(type-driven)_ | `$[val]` renders by the bound's TYPE on the i18n path: an `isCurrency`-marked bound (`TF.Currency`) via the renderer's `currency` option, date-family bounds via `Intl.DateTimeFormat` — no per-template syntax |

Unknown `$[…]` tokens are left verbatim (including any leftover colon-form
`$[val:kind:name]` token — that named-format syntax was removed; `enrich --no-emit` flags it via
FT005); a literal colon in prose (`ratio 3:1`) is never touched. `$[value]` (the actual
received value) is out of scope for v1 — `RunTypeError` carries no value.

## Plural templates on count-bearing constraints

On the count-bearing constraints — `minLength`, `maxLength`, `min`, `max`, `lt`, `gt` —
an error-template leaf is either a plain string or a **plural object** whose arms are
CLDR cardinal categories (`TemplateLeaf = string | PluralTemplate`; `PluralTemplate` is
`{other: string}` plus optional `zero`/`one`/`two`/`few`/`many` arms):

```ts
name: {
  rt$label: 'Full name',
  rt$errors: {
    type: '$[label] must be text',                        // plain string, as before
    minLength: {                                          // plural object
      one: '$[label] needs at least $[val] character',
      other: '$[label] needs at least $[val] characters',
    },
  },
},
```

- `enrich` scaffolds the plural object for you (`minLength: {one: '', other: ''}`), its arms
  taken from the SOURCE locale's CLDR cardinal category set (tsconfig
  `i18n.sourceLocale`, default `en`; built-in table: en, es, zh, hi, ar, pt, ru, ja, de,
  fr, pl — any other locale scaffolds all six categories `zero one two few many other`).
  **Fill the arms; never restructure the object.** Only `other` is mandatory; prune the
  arms you don't use.
- All other constraints (`type`, `pattern`, `allowedChars`, …) stay plain strings, and
  `rt$label` is always a plain string. A plain string on a count-bearing constraint
  remains legal.
- **The plural count is the VIOLATED BOUND** (`$[val]` — a `minLength: 3` failure selects
  the arm for `3`), NOT the received value's length. The renderer picks the arm via
  `Intl.PluralRules(locale)`; `other` is the backstop, and a non-finite bound selects
  `other` directly. Plain `createFriendlyText` uses `en` rules (deterministic, matching the
  default `sourceLocale`).

## Per-constraint vs `rt$default` — the two (exclusive) modes

`rt$errors` is EITHER the per-constraint record OR the single catch-all — never a mix,
and never a function (the v1 inline-arrow escape hatch was REMOVED: opaque to
translation, reconcile and the checker; only data survives):

- **Per-constraint** — `{type: '…', minLength: '…', …}`. Yields **one message per
  failed constraint**; every key compiler-validated (placeholders too, FT005).
- **`rt$default`** — `{rt$default: '…'}`. Yields ONE message for the whole field, whatever
  failed (a multi-constraint failure still renders a single message). Plain data, so it
  translates and reconciles like any other leaf.

```ts
// rt$default mode — one sentence covers every failure of the field
name: {
  rt$label: 'Full name',
  rt$errors: {rt$default: 'Enter a name between 2 and 60 characters'},
},
```

## Where the map lives — the friendly mirror file

Enrichment is committed to a **mirror directory** whose tree shadows your source, one
file per family, anchored at the file where the **type is defined**, not where it's
consumed: `src/models/user.ts` → `<genDir>/enriched/friendly/models/user.ts` (default
`genDir`: `<genDir>/enriched`, so `src/__runtypes/enriched/friendly/models/user.ts`),
holding `friendly<Name>` consts. `MockData<T>` consts live separately under
`<genDir>/enriched/mock/…` — the two families never share a file. One mirror file per source
file, one `export` per enriched type defined there. This mirrors the cache's "one
canonical entry per structural id, app-wide" rule — **one enrichment home per type, at
its definition**, however many files consume it. It is the first committed RunTypes
artifact (every other output is gitignored cache) and is hand-editable.

```ts
// src/__runtypes/enriched/friendly/models/user.ts — committed, hand-editable
import type {FriendlyText} from 'ts-runtypes';
import type {User} from '../../../../src/models/user';

/** @rtType User#9f3a @rtIds {…} */
export const friendlyUser: FriendlyText<User> = {
  /* … */
};
```

The `import type` line is best-effort — if a consumed type isn't exported, the file
fails to compile and you fix the export.

## Build-time validation — the FT0xx checks

The `enrich --no-emit` mode cross-references the authored literal against the live `RunType` and
reports:

| Code  | Severity | Meaning                                                                                                                                                                                                      |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FT001 | Info     | a field of `T` has no label (renders the raw name)                                                                                                                                                           |
| FT002 | Error    | key is not a field of `T` — stale (field renamed/removed)                                                                                                                                                    |
| FT003 | Warning  | `rt$errors` key isn't a constraint this field's format declares (TS catches this first as an excess-property error)                                                                                          |
| FT004 | Error    | structural mismatch (object node where `T` is scalar, or vice-versa)                                                                                                                                         |
| FT005 | Warning  | unknown `$[…]` placeholder for this constraint/context — checked per plural arm; also validates three-part format tokens (binding must be `val`/`index`; kind must be `number`/`date`/`relativeTime`/`list`) |
| FT006 | Error    | a plural object is missing the mandatory `other` arm                                                                                                                                                         |
| FT007 | Warning  | a plural-object arm key is not a CLDR category                                                                                                                                                               |
| FT008 | Warning  | a plural object on a non-count-bearing constraint (dead arms)                                                                                                                                                |
| FT009 | Error    | `rt$default` beside any other `rt$errors` key — the modes are mutually exclusive                                                                                                                             |
| FT010 | Info     | `T`'s structural id changed since authored — review for drift                                                                                                                                                |
| FT011 | Error    | a property of `T` is named `rt$…` — the reserved meta prefix (`enrich` refuses the type up front; rename the property)                                                                                       |

These catch drift: rename a field and `FT002` flags the now-stale entry.

## Rendering at runtime — `createFriendlyText<T>(map)`

```ts
import {createGetValidationErrorsFn, createFriendlyText} from 'ts-runtypes';
import {friendlyUser} from 'src/__runtypes/enriched/friendly/models/user';
import type {User} from '../models/user';

const getUserErrors = createGetValidationErrorsFn<User>();
const friendly = createFriendlyText<User>(friendlyUser);

friendly.errors(getUserErrors(badInput));
// → [{ path: 'profile.email', label: 'Email', message: 'Enter a valid email address' }, …]

friendly.label('profile.email'); // → 'Email'  (falls back to the raw field name)
```

`createFriendlyText` returns `{ errors(errs), label(path) }`:

- `errors(errs)` — groups `RunTypeError[]` by path, looks up the node, and for each
  failed constraint interpolates the matching template (a `rt$default` node instead
  renders a single message for the whole field). Returns `FriendlyMessage[]`
  (`{ path, label, message }`).
- `label(path)` — the friendly label for a dotted path or a raw path-segment array.

## Translations — per-locale `FriendlyText<T>` files under `<genDir>/enriched/i18n`

The friendly map you authored IS the source language (tsconfig `i18n.sourceLocale`,
default `en`) — there is no separate default catalog and no separate translation type.
A locale file is a `FriendlyText<T>` map authored in another language, generated from
the SOURCE TYPE by the same driver as the friendly mirror (the mirror is a discovery
input only — which sources translate — never a content input; no generated file ever
feeds the generation of another). Translation is optional per leaf; anything unfilled
falls back to the source at render time.

- One committed file per locale per source mirror: `<i18nDir>/<locale>/<rel>.ts`
  (default `i18nDir`: `<genDir>/enriched/i18n`, e.g. `src/__runtypes/enriched/i18n/pl/models/user.ts`;
  the locale is a path segment, so `pt-BR` works verbatim).
- The const per type is `<locale>_friendly<Name>` — BCP-47 `-` becomes `_`
  (`pt_BR_friendlyUser`) — annotated `FriendlyText<Name>`, carrying the SAME
  `@rtType <Name>#<id> @rtIds {…}` markers as the source. The path + const prefix
  carry the locale; there is no i18n marker.
- Scaffold with `ts-runtypes enrich --i18n <locale|all>`; reconcile with `--update`
  (src-driven, value-preserving, descends `rt$errors`); strip orphan carcasses with
  `--prune`; gate completeness in CI with `enrich --i18n <locale|all> --no-emit` (findings
  TR001–TR004; TR003 = a src-driven reconcile would change the file). CLI + tsconfig
  `i18n` reference: the `rt-enrich-types` skill.
- The scaffold is the type's tree with every string leaf and plural arm as an `@todo`
  blank (`''`) — it NEVER copies source text as if translated (the type has no
  strings). Plural objects carry the TARGET locale's CLDR arm set, and const
  references rename to their locale siblings (`home: pl_friendlyAddress`).

**Filling a translation file:** translate ONLY blank (`''`) leaves; never edit an
already-filled leaf; never copy the source text across. Prune the plural arms your
language doesn't use — arms are locale-owned, so a pruned arm stays pruned across
reconciles (only the mandatory `other` is ever re-inserted). A `rt$default`-mode node
has exactly one string to translate and is never descended.

```ts
// src/__runtypes/enriched/i18n/pl/models/user.ts — committed, filled by a translator/agent
import type {FriendlyText} from 'ts-runtypes';
import type {User} from '../../../../../src/models/user';

/** @rtType User#9f3a @rtIds {…} */
export const pl_friendlyUser: FriendlyText<User> = {
  /* … */
};
```

## Locale-aware rendering — `createFriendlyTextI18n`

`createFriendlyTextI18n(source, options)` returns the same `FriendlyRenderer` interface as
`createFriendlyText`:

```ts
import {createFriendlyTextI18n} from 'ts-runtypes';
import {friendlyUser} from 'src/__runtypes/enriched/friendly/models/user';
import {es_friendlyUser} from 'src/__runtypes/enriched/i18n/es/models/user';
import {pl_friendlyUser} from 'src/__runtypes/enriched/i18n/pl/models/user';

const friendly = createFriendlyTextI18n(friendlyUser, {
  locale: currentLocale, // string | {value: string} — a {value} ref (e.g. a Vue Ref)
  translations: {es: es_friendlyUser, pl: pl_friendlyUser},
  currency: 'EUR', // optional ISO 4217 code (string or {value} ref) for TF.Currency bounds
  sourceLocale: 'en', // optional (default 'en'): plural rules when rendering from the SOURCE map
});

friendly.errors(getUserErrors(badInput)); // arm + template picked per the active locale
```

- A `{value}` locale ref is re-read on EVERY render, but the renderer itself is not
  reactivity-tracked — call `errors()` per render / inside `computed()`.
- Locale matching is `resolveLocale(locale, translations)`: naive BCP-47 truncation —
  exact tag, then subtags dropped right-to-left (`pt-BR` → `pt`), then any available tag
  sharing the base language (`zh-Hant` matches a `zh-Hans` file when nothing closer
  exists — deliberate, simple). Returns `undefined` when nothing shares the base
  language; the renderer then uses the source.
- Fallback is per-leaf and never throws on a partial translation (a reserved `strict`
  option exists; the runtime is always lenient): a blank (`''`) or missing translated
  leaf falls to the source — `rt$label` and each `rt$errors` key independently, with a
  node's own authored `rt$default` tried before falling cross-map. A plural leaf falls
  through as a WHOLE unit (never mixes a target arm with a source arm).
- Type-driven `$[val]` rendering: the error's format payload says what the bound IS.
  An `isCurrency`-marked number bound (`TF.Currency<P>` = `Number<P & {isCurrency:
true}>`; the pure-metadata param is echoed onto every error the field produces)
  renders via `Intl.NumberFormat(locale, {style: 'currency', currency})` with the
  app-supplied `currency` option (omitted → plain localized number, never a guessed
  symbol; WHICH currency a value is in is app DATA, deliberately not fixed in the
  type); a date-family bound renders via `Intl.DateTimeFormat(locale)` (an
  unparseable relative bound like `now-P1D` stays verbatim); everything else stays
  `String(val)`. Unknown tokens stay verbatim. `Intl` instances are memoized
  (`PluralRules` per locale; bound formatters per locale + currency / style). Plain
  `createFriendlyText` stays byte-stable (`String(val)` everywhere).

## End-to-end example

```ts
// src/models/user.ts — the DEFINITION
import type {FormatString, FormatNumber, FormatEmail} from 'ts-runtypes';

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
// src/__runtypes/enriched/friendly/models/user.ts — the committed friendly mirror
import type {FriendlyText} from 'ts-runtypes';
import type {User} from '../../../../src/models/user';

export const friendlyUser: FriendlyText<User> = {
  rt$label: 'User account',
  rt$errors: {type: '$[label] must be an object'},

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
  isActive: {rt$label: 'Active?', rt$errors: {type: ''}},

  tags: {
    rt$label: 'Tags',
    rt$errors: {type: ''},
    rt$items: {rt$label: '', rt$errors: {type: 'each tag must be text'}}, // element node
  },

  profile: {
    // nested object — recurse
    rt$label: 'Profile',
    rt$errors: {type: ''},
    email: {rt$label: 'Email', rt$errors: {type: '', pattern: 'Enter a valid email address'}},
    score: {rt$label: 'Score', rt$errors: {rt$default: 'Score must be between 0 and 100'}}, // rt$default mode
  },
};
```

```ts
// src/services/userForm.ts — the CONSUMER
import {createGetValidationErrorsFn, createFriendlyText} from 'ts-runtypes';
import {friendlyUser} from 'src/__runtypes/enriched/friendly/models/user';
import type {User} from '../models/user';

const getUserErrors = createGetValidationErrorsFn<User>();
const friendly = createFriendlyText<User>(friendlyUser);

const messages = friendly.errors(getUserErrors({name: 'A', age: 200, profile: {email: 'nope', score: 5}}));
// name     → 'Full name needs at least 2 characters'
// age      → 'Age must be no more than 120'
// profile.email → 'Enter a valid email address'
```

## Authoring checklist

- Put the map in the **definition's friendly mirror file**
  (`<genDir>/enriched/friendly/<rel>.ts`), not the consumer's file.
- Type it `FriendlyText<T>` so structure is checked against `T`. The map is TOTAL:
  every field present, `rt$label` + `rt$errors` on every node. Blank `''` = no custom
  text (FT001 Info nudges unlabeled fields); never delete a key — it re-scaffolds.
- The `rt$errors` key set is exactly the field's **declared failable format params**
  plus `type` — the mapped type requires each and rejects any other. A bare `string`
  takes `type` only.
- Want one sentence per field? Use `rt$errors: {rt$default: '…'}` — exclusive, never mixed
  with per-constraint keys (FT009). Scaffolds are always per-constraint; switch a
  node by hand.
- On count-bearing constraints, fill the scaffolded plural arms in place — never
  restructure the object; keep `other` (FT006), prune unused arms; remember the count is
  the violated bound, not the received value's length.
- In a locale file, translate only blank leaves, never copy the source text, and prune
  the arms your language doesn't use — they stay pruned.
- For arrays use `rt$items` (fixed tuples `rt$slots`; Map/Set `rt$keys` / `rt$values`); for
  nested objects recurse with the same node shape.
