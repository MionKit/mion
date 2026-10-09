# Rendering at runtime

`createFriendlyText<T>(map)` for one language, `createFriendlyTextI18n` for locales.

## `createFriendlyText<T>(map)`

```ts
// src/services/userForm.ts
import {createGetValidationErrorsFn, createFriendlyText} from '@mionjs/run-types';
import {friendlyUser} from '../.mion/enriched/friendly/src/models/user';
import type {User} from '../models/user';

const getUserErrors = createGetValidationErrorsFn<User>();
const friendly = createFriendlyText<User>(friendlyUser);

const badInput: unknown = {name: 'A', age: 200, profile: {email: 'nope'}};
friendly.errors(getUserErrors(badInput));
// → [{ path: 'profile.email', label: 'Email', message: 'Enter a valid email address' }, …]

friendly.label('profile.email'); // → 'Email'  (falls back to the raw field name)
```

Returns `{ errors(errs), label(path) }`:

- `errors(errs)`: groups `RunTypeError[]` by path, looks up the node,
  interpolates the matching template per failed constraint.
  - `rt$default` node → single message for the whole field.
  - Returns `FriendlyMessage[]` (`{ path, label, message }`).
- `label(path)`: friendly label for a dotted path or a raw path-segment array.

## `createFriendlyTextI18n(source, options)`

Same `FriendlyRenderer` interface as `createFriendlyText`.

```ts
// src/services/userForm.ts
import {createFriendlyTextI18n, createGetValidationErrorsFn} from '@mionjs/run-types';
import {friendlyUser} from '../.mion/enriched/friendly/src/models/user';
import {es_friendlyUser} from '../.mion/enriched/i18n/es/src/models/user';
import {pl_friendlyUser} from '../.mion/enriched/i18n/pl/src/models/user';
import type {User} from '../models/user';

const getUserErrors = createGetValidationErrorsFn<User>();
const currentLocale = navigator.language;
const badInput: unknown = {name: 'A', age: 200};

const friendly = createFriendlyTextI18n(friendlyUser, {
  locale: currentLocale, // string | {value: string}: a {value} ref (e.g. a Vue Ref)
  translations: {es: es_friendlyUser, pl: pl_friendlyUser},
  currency: 'EUR', // optional ISO 4217 code (string or {value} ref) for TF.Currency bounds
  sourceLocale: 'en', // optional (default 'en'): plural rules when rendering from the SOURCE map
});

friendly.errors(getUserErrors(badInput)); // arm + template picked per the active locale
```

- `{value}` locale ref is re-read on EVERY render. Renderer itself is not reactivity-tracked:
  call `errors()` per render / inside `computed()`.
- Locale matching: `resolveLocale(locale, translations)`, naive BCP-47 truncation.
  - Exact tag, then subtags dropped right-to-left (`pt-BR` → `pt`).
  - Then any available tag sharing the base language (`zh-Hant` matches a `zh-Hans` file when nothing closer).
  - Nothing shares the base language → `undefined` → renderer uses the source.
- Fallback is per-leaf, never throws on a partial translation.
  - Reserved `strict` option exists; runtime is always lenient.
  - Blank (`''`) or missing translated leaf → source. `rt$label` and each `rt$errors` key independently.
  - Node's own authored `rt$default` tried before falling cross-map.
  - Plural leaf falls through as a WHOLE unit: never mixes a target arm with a source arm.
- Type-driven `$[val]`: the error's format payload says what the bound IS.
  - `isCurrency`-marked number bound (`TF.Currency<P>` = `Number<P & {isCurrency: true}>`):
    pure-metadata param echoed onto every error the field produces.
    Renders via `Intl.NumberFormat(locale, {style: 'currency', currency})` with the app-supplied `currency` option.
  - `currency` omitted → plain localized number, never a guessed symbol.
    WHICH currency a value is in = app DATA, not fixed in the type.
  - Date-family bound → `Intl.DateTimeFormat(locale)`. Unparseable relative bound (`now-P1D`) stays verbatim.
  - Everything else → `String(val)`. Unknown tokens stay verbatim.
- `Intl` instances memoized: `PluralRules` per locale, bound formatters per locale + currency / style.
- Plain `createFriendlyText` stays byte-stable: `String(val)` everywhere.
