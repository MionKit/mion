# Translations: per-locale `FriendlyText<T>` files

Filling locale files under `<genDir>/enriched/i18n`.

- Locale file = `FriendlyText<T>` map authored in another language.
  The source map you authored IS the source language (tsconfig `i18n.sourceLocale`, default `en`).
- File: `<i18nDir>/<locale>/<rel>.ts`, e.g. `src/.mion/enriched/i18n/pl/src/models/user.ts`.
- Const: `<locale>_friendly<Name>` (`pt_BR_friendlyUser`), same `@rtType` / `@rtIds` markers as the source.
- Layout, CLI (`mion enrich --i18n <locale|all>`, `--update`, `--prune`, `--no-emit`), enrich-i18n-\* findings,
  tsconfig `i18n` block: `rt-enrich-types` skill.
- Translation is optional per leaf: anything unfilled falls back to the source at render time.

## Scaffold

- Type's tree with every string leaf + plural arm as an `@todo` blank (`''`).
- NEVER copies source text as if translated (the type has no strings).
- Plural objects carry the TARGET locale's CLDR arm set.
- Const references rename to their locale siblings (`home: pl_friendlyAddress`).

## Filling a translation file

- Translate ONLY blank (`''`) leaves. Never edit an already-filled leaf. Never copy the source text across.
- Prune plural arms your language doesn't use. Arms are locale-owned: a pruned arm stays pruned across reconciles.
  Only the mandatory `other` is ever re-inserted.
- `rt$default`-mode node: exactly one string to translate, never descended.

```ts
// src/.mion/enriched/i18n/pl/src/models/user.ts: committed, filled by a translator/agent
import type {User} from '../../../../../../models/user';
import type {FriendlyText} from '@mionjs/run-types';

/** @rtType User#9f3a @rtIds {…} */
export const pl_friendlyUser: FriendlyText<User> = {
  /* … */
};
```

Rendering locale files: `createFriendlyTextI18n` → [rendering.md](rendering.md).
