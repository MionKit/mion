---
name: runtypes-friendly-text
description: FriendlyText<T> rt$label/rt$errors ($[val], plurals, createFriendlyText). Use for friendly errors/labels.
---

# Authoring & using `FriendlyText<T>`

- One of two AI-enrichment artifacts in RunTypes. Other: `MockData<T>` (`runtypes-mock-data` skill).
- Enrichment is authored once, committed, validated against the type. CLI loop: `rt-enrich-types` skill.
- Full design: [docs/AI_ENRICHMENT.md](https://github.com/MionKit/mion/blob/main/docs/AI_ENRICHMENT.md).
- `FriendlyText<T>` = combined per-field map of:
  - **labels**: `rt$label`, human name per field (`'Full name'` for `name`).
  - **error-message templates**: `rt$errors`, one template per failed constraint.
- **Pure data.** `createFriendlyText<T>(map)` renders `createGetValidationErrorsFn<T>()` output as readable messages.
- No type-id injection, no `rtUtils`: error rendering needs only `(map, errors)`.

## When to use it

- Turn `createGetValidationErrorsFn<T>()` errors into readable text, not raw `{ path, expected, format }`.
- You need stable human field **labels** (form building, error summaries).
- Scaffolding a type's committed friendly mirror file.
- Filling a locale's translation file (also typed `FriendlyText<T>`, rendered via `createFriendlyTextI18n`).
- Boolean pass/fail only → `createValidateFn<T>()` directly, no friendly map.

## Shipped vs designed

- **Shipped**, all exported from `@mionjs/run-types`:
  - [`friendlyText.ts`][ft]: `FriendlyText<T>` + plural types `PluralTemplate`, `TemplateLeaf`, `PluralCategory`.
  - [`createFriendlyText.ts`][cft]: plural-aware `createFriendlyText<T>(map)`, `createFriendlyTextI18n`,
    `resolveLocale`.
  - `enrich` / `enrich --no-emit` CLI (incl. `--i18n`) scaffolds + validates the committed maps.
- **Designed (not yet wired):** `ShapeCheckedArgs<T>` compile-time axis, `rtUtils` registry accessors.

## Node model: `{ rt$label, rt$errors, ...children }`

- One recursive node, uniform at every depth. No `fields:` wrapper: leaf nodes simply have no children.
- `rt$`-prefixed keys = **meta**. Every other key = **child field**. A plain `$foo` property is just a field.
- `rt$` prefix RESERVED: source-type property named `rt$…` is refused by `enrich` (enrich-text-reserved-prefix).
- `rt$label: string`: field's human name, always a plain string. REQUIRED.
- `rt$errors`: field's error templates. REQUIRED. Per-constraint record OR exclusive `{rt$default: '…'}` catch-all.
  - Template leaf: plain string, or a **plural object** on count-bearing constraints (`TemplateLeaf`).
- Arrays + rest tuples: `rt$items` (element node). Fixed tuples: positional `rt$slots`.
- `Map`: `rt$keys` / `rt$values`. `Set`: `rt$values`.
- Nested objects recurse with the _same_ node shape, every field of `T` present.
- ⚠️ **The map is TOTAL.** Every field appears, every node carries both meta keys.
  - Blank `''` = "no custom text" (renderer falls back gracefully), so blanks are always safe.
  - Never delete a key to opt out: next `enrich --update` scaffolds it back. One type maps to exactly one shape.
- `FriendlyText<T>` mapped type checks structure against `T`: missing field, object node where `T` is scalar
  (or vice-versa), unknown `rt$errors` key = TYPE errors, caught in the IDE before `enrich --no-emit` runs.

## Detail pages

- `rt$errors` keys, `rt$default` mode, `$[…]` placeholders, plurals:
  [error-templates.md](references/error-templates.md). Read before writing any template.
- enrich-text-\* checks and levels → [checks.md](references/checks.md). Read when `enrich --no-emit` reports one.
- `createFriendlyText` / `createFriendlyTextI18n` runtime → [rendering.md](references/rendering.md).
- Locale files, fill rules → [translations.md](references/translations.md). Read before filling a translation.
- Full type → map → consumer example → [example.md](references/example.md).

## Where the map lives: friendly mirror file

- At the file where the type is **defined**, not consumed: `src/models/user.ts` →
  `<genDir>/enriched/friendly/src/models/user.ts` (default `src/.mion/enriched/friendly/src/models/user.ts`).
- Holds `friendly<Name>` consts. `MockData<T>` consts live separately under `<genDir>/enriched/mock/…`.
- Mirrors the cache's "one canonical entry per structural id, app-wide" rule.
- Layout rules (genDir, `rootDir`, `import type` breadcrumb): `rt-enrich-types` skill.

```ts
// src/.mion/enriched/friendly/src/models/user.ts: committed, hand-editable
import type {User} from '../../../../../models/user';
import type {FriendlyText} from '@mionjs/run-types';

/** @rtType User#9f3a @rtIds {…} */
export const friendlyUser: FriendlyText<User> = {
  /* … */
};
```

## Authoring checklist

- Map goes in the **definition's friendly mirror file** (`<genDir>/enriched/friendly/<rel>.ts`), not the consumer's.
- Type it `FriendlyText<T>` so structure is checked against `T`. Keep it TOTAL (Node model above).
- `rt$errors` key set = `type` + the field's **declared failable format params**.
  Others optional in the type, any other key rejected. A bare `string` takes `type` only.
- One sentence per field? `rt$errors: {rt$default: '…'}`. Exclusive, never mixed with per-constraint keys
  (enrich-text-default-and-messages). Scaffolds always per-constraint: switch a node by hand.
- Count-bearing constraints: fill scaffolded plural arms in place, never restructure the object.
  Keep `other` (enrich-text-plural-missing-other), prune unused arms.
  Count = the violated bound, not the received value's length.
- Locale file: translate only blank leaves, never copy source text, prune arms your language doesn't use
  (they stay pruned).

[ft]: https://github.com/MionKit/mion/blob/main/packages/run-types/src/enrich/friendlyText.ts
[cft]: https://github.com/MionKit/mion/blob/main/packages/run-types/src/enrich/createFriendlyText.ts
