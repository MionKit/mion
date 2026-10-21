# Error templates: keys, modes, placeholders, plurals

What goes inside `rt$errors`.

## `rt$errors` keys = the failed-constraint name

- Each key names the sub-constraint that failed. Not an invented set:
  maps 1:1 onto what `createGetValidationErrorsFn<T>()` emits.
- Renderer picks the template by the error's `(format.name, formatPath-tail)` discriminator.
- `type`: base type-shape failure (a `RunTypeError` with no `.format`), "not even the right kind of value".
  Always present.
- Format sub-constraints, exactly as the type declares them:
  - string: `minLength`, `maxLength`, `pattern`, `allowedChars`
  - number: `min`, `max`, `lt`, `gt`, `integer`
  - datetime: `date`, `time`, `splitChar`
  - `Date` bound: `min` / `max`; `uuid`: `version`
- **Keys come from the format's own error code.** `ErrorTemplates<F>` reads the field's format NAME,
  allows the keys in the generated `FormatErrorKeys` table (`src/go-generated/formatErrorKeys.generated.ts`,
  built from each format's validation-errors code).
- Every constraint key is optional in the type. Unknown key = excess-property TYPE error.
- `enrich --no-emit` reports a missing key (enrich-text-missing-message)
  or one this field can never fail on (enrich-text-unknown-error-key).
- `enrich --update` adds missing keys as blanks.
- Params that never fail (`float`, `isCurrency`, `mockSamples`, `separators`, the transformers) never become keys.
- JSON Schema bounds (`minimum`, `exclusiveMinimum`, ...) use `min` / `max` / `gt` / `lt`.
- Bare `name: string` takes `type` only. Richer friendly map requires a richer type annotation.

## Two exclusive modes: per-constraint vs `rt$default`

`rt$errors` is EITHER the per-constraint record OR the single catch-all. Never a mix.
Never a function: only data survives translation, reconcile and the checker.

- **Per-constraint**: `{type: '…', minLength: '…', …}`. **One message per failed constraint**.
  Every key compiler-validated, placeholders too (enrich-text-unknown-placeholder).
- **`rt$default`**: `{rt$default: '…'}`. ONE message for the whole field, whatever failed.
  Plain data: translates and reconciles like any other leaf.
- Mixing = TS union error + enrich-text-default-and-messages (Warning).
- Each node picks its own mode. `enrich` always scaffolds NEW nodes per-constraint: switch to `rt$default` by hand.
  Once a node exists, every sync follows its authored mode.
- Errors **accumulate**: violating `minLength` _and_ `pattern` → two messages (a list).
  A `rt$default` node collapses them to one message.

```ts
// rt$default mode: one sentence covers every failure of the field
name: {
  rt$label: 'Full name',
  rt$errors: {rt$default: 'Enter a name between 2 and 60 characters'},
},
```

## Placeholder DSL

Templates are plain strings with `$[…]` tokens the renderer substitutes:

- `$[label]`: node's `rt$label`, falling back to the raw field name.
- `$[val]`: failed constraint's bound (`error.format.val`; e.g. `2`).
- `$[path]`: dotted path to the field (`profile.email`).
- `$[index]`: array element index, for `rt$items` failures.
- Type-driven: on the i18n path `$[val]` renders by the bound's TYPE, no per-template syntax.
  `isCurrency`-marked bound (`TF.Currency`) → renderer's `currency` option. Date-family bound → `Intl.DateTimeFormat`.
- Unknown `$[…]` tokens left verbatim; `enrich --no-emit` flags them (enrich-text-unknown-placeholder).
- Literal colon in prose (`ratio 3:1`) never touched.
- `$[value]` (actual received value) out of scope for v1: `RunTypeError` carries no value.

## Plural templates on count-bearing constraints

- Count-bearing: `minLength`, `maxLength`, `min`, `max`, `lt`, `gt`.
- Their leaf = plain string or **plural object** with CLDR cardinal category arms.
- `TemplateLeaf = string | PluralTemplate`.
- `PluralTemplate` = `{other: string}` + optional `zero`/`one`/`two`/`few`/`many` arms.

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

- `enrich` scaffolds the plural object (`minLength: {one: '', other: ''}`).
  - Arms from the SOURCE locale's CLDR cardinal set (tsconfig `i18n.sourceLocale`, default `en`).
  - Built-in table: en, es, zh, hi, ar, pt, ru, ja, de, fr, pl. Other locale → all six `zero one two few many other`.
- **Fill the arms; never restructure the object.** Only `other` mandatory. Prune arms you don't use.
- All other constraints (`type`, `pattern`, `allowedChars`, …) stay plain strings. `rt$label` always a plain string.
- Plain string on a count-bearing constraint stays legal.
- **Plural count = the VIOLATED BOUND** (`$[val]`: `minLength: 3` failure selects the arm for `3`).
  NOT the received value's length.
- Arm picked via `Intl.PluralRules(locale)`. `other` = backstop. Non-finite bound → `other` directly.
- Plain `createFriendlyText` uses `en` rules (deterministic, matches default `sourceLocale`).
