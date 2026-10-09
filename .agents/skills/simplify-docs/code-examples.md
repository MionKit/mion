# Real examples: code

Every pair is real. Part of [examples.md](examples.md).

## Example comments

NO: comment block at the top repeating the paragraph above the example. Comments explain the API, not the line.

```ts
/* @mion-downgrade-error validate-symbol-root */
// The block comment above sits before any code, so it covers this whole file:
// every validate-symbol-root below prints as a warning instead of stopping the build. Written
// with no code after the word, `/* @mion-downgrade-error */`, it covers every
// finding in the file.

import {createValidateFn} from '@mionjs/run-types';

// A `symbol` holds nothing a validator can check, so each of these raises validate-symbol-root.
export const validateSymbol = createValidateFn<symbol>();
export const validateAnotherSymbol = createValidateFn<symbol>();

// A line comment covers only the line under it. `@mion-expect-error` removes the
// finding instead of lowering it, so nothing is printed for this one.
// @mion-expect-error validate-symbol-root
export const validateSymbolQuietly = createValidateFn<symbol>();
```

YES: one-liners on the lines that matter, saying why that line is there. Nothing the paragraph or table says.

```ts
/* @mion-downgrade-error validate-symbol-root */
import {createValidateFn} from '@mionjs/run-types';

// both raise validate-symbol-root; the file comment above makes them warnings
export const validateSymbol = createValidateFn<symbol>();
export const validateAnotherSymbol = createValidateFn<symbol>();

// the line comment hides this one completely
// @mion-expect-error validate-symbol-root
export const validateSymbolQuietly = createValidateFn<symbol>();
```

## Repetition

NO: the paragraph says what the example's comment says.

```md
A line comment covers the line under it. A block comment before any code covers the whole file. Both raise
validate-symbol-root because a symbol has no value to check.

<code-import path="packages/private-examples/src/guide/disabling-errors.ts" lang="ts" />
```

with the example carrying `// A symbol holds no value to check, so both of these raise validate-symbol-root.`

YES: the fact lives once, where the reader meets it first.

```md
Use `//` above a line to cover that line. Use `/* */` at the top of the file to cover the whole file.

<code-import path="packages/private-examples/src/guide/disabling-errors.ts" lang="ts" />
```
