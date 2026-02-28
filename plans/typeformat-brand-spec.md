# TypeFormat Brand Specification (Optional Branding)

## Status

### ✅ Completed

- [x] `@mionkit/core` - Brand types and TypeFormatParams with brand support
- [x] `@mionkit/run-types` - TypeFormat with 4th BrandName parameter

### 🔄 In Progress

- [ ] `@mionkit/type-formats` - Update all format types to use new TypeFormat signature

## Goal

1. Keep **runtime format metadata** (Deepkit `TypeAnnotation`) for server-side validation/serialization.
2. Make **branding optional** via a `BrandName` type parameter on TypeFormat.
3. Ensure clients can use **the same branded types by importing only from** `@mionkit/core` (no dependency on `@mionkit/type-formats`).

## Additional Requirements

1. **All string type-formats must be branded by default, except `FormatString` itself.**
   - Examples: `FormatEmail`, `FormatUUID`, `FormatUrl`, `FormatDomain`, `FormatIP`, `FormatStringDate`, `FormatStringTime`, `FormatStringDateTime` should all produce branded string types even if the caller does not specify `brand`.
   - `FormatString` remains the "escape hatch" and is unbranded unless `brand` is explicitly provided.
2. **`FormatString`, `FormatNumber`, and `BigintFormat` have optional brand parameter** - all other formats pass a default brand.

### Desired API

```ts
// FormatString - optional brand (4th type parameter)
type MyCustomString = FormatString<{minLength: 10}, 'custom'>; // branded (nominal)
type MyCustomString2 = FormatString<{minLength: 10}>; // not branded (plain string)

// FormatEmail - always branded (default brand = 'email')
type Email = FormatEmail; // branded with 'email'
type CustomerEmail = FormatEmail<{}, 'CustomerEmail'>; // branded with 'CustomerEmail'
```

## Key Design Decision

**Decouple "format" (runtime validation identity) from "brand" (TypeScript nominal typing).**

- `format` should remain stable and known to the runtime validator (e.g. `'string'`, `'email'`, `'uuid'`).
- `brand` should be a purely type-level addition that can be enabled/disabled per usage.

## ⚠️ CRITICAL: Deepkit Type Compiler Limitations

**Conditional types with `infer` do NOT work with type compiler!**

The original spec proposed:

```ts
// ❌ DOES NOT WORK - Deepkit cannot handle conditional types with infer
type BrandIfProvided<BaseType, P> = P extends {brand: infer B extends string} ? Brand<BaseType, B> : BaseType;
```

**Solution: Use explicit 4th type parameter instead of inferring from params.**

```ts
// ✅ WORKS - Explicit type parameter, simple conditional
export type TypeFormat<
  BaseType extends TypeFormatPrimitives,
  Name extends string,
  P extends TypeFormatParams,
  BrandName extends string = never,
> = BrandName extends never
  ? BaseType & TypeAnnotation<Name, P>
  : Brand<BaseType, BrandName> & TypeAnnotation<Name, P & {brand: BrandName}>;
```

**Also critical: NEVER use `import type` for types that need reflection!**

```ts
// ❌ WRONG - This breaks reflection!
import type {TypeFormatParams, Brand} from '@mionkit/core';

// ✅ CORRECT - Use regular import for types that need reflection
import {TypeFormatParams, Brand} from '@mionkit/core';
```

## Architecture

```
@mionkit/core
└── Brand<BaseType, Name> (generic) + pre-defined brands (BrandEmail, BrandUUID, etc.)
└── TypeFormatParams, TypeFormatPrimitives

@mionkit/run-types
└── TypeFormat<BaseType, Name, P, BrandName = never>
    - adds TypeAnnotation<Name, P> (or P & {brand: BrandName} when branded)
    - conditionally adds Brand<BaseType, BrandName> when BrandName is not never

@mionkit/type-formats
└── FormatString<P, BrandName = never> = TypeFormat<string, 'stringFormat', P, BrandName>
└── FormatEmail<P, BrandName = 'email'> = TypeFormat<string, 'email', P, BrandName>
    ...
```

## Implementation

### 1) `@mionkit/core` — Brand types (generic + pre-defined) ✅ DONE

```ts
// packages/core/src/types/formats/formatBrands.types.ts

import {TypeFormatPrimitives} from './formats.types';

/** Base branded type - combines BaseType with a nominal brand marker. */
export type Brand<BaseType extends TypeFormatPrimitives, Name extends string> = BaseType & {brand: Name};

// String brands - format names must match the formatter IDs in type-formats package
export type BrandString = Brand<string, 'stringFormat'>;
export type BrandEmail = Brand<string, 'email'>;
export type BrandUUID = Brand<string, 'uuid'>;
export type BrandUrl = Brand<string, 'url'>;
export type BrandDomain = Brand<string, 'domain'>;
export type BrandIP = Brand<string, 'ip'>;
export type BrandDate = Brand<string, 'date'>;
export type BrandTime = Brand<string, 'time'>;
export type BrandDateTime = Brand<string, 'dateTime'>;

// Number brands
export type NumBrand = Brand<number, 'numberFormat'>;

// BigInt brands
export type BigIntBrand = Brand<bigint, 'bigintFormat'>;
```

### 2) `@mionkit/run-types` — TypeFormat with explicit BrandName parameter ✅ DONE

```ts
// packages/run-types/src/lib/formats.runtype.ts

import {TypeAnnotation} from '@deepkit/core';
// ⚠️ CRITICAL: Do NOT use `import type` - Deepkit needs the actual import for reflection!
import {TypeFormatParams, Brand, TypeFormatPrimitives} from '@mionkit/core';

/**
 * TypeFormat attaches runtime annotation for FormatName + params,
 * and optionally adds a compile-time Brand.
 *
 * @param BaseType - The base type (string, number, or bigint)
 * @param Name - The format name used for runtime validation
 * @param P - Format parameters for validation rules
 * @param BrandName - Optional brand name for nominal typing (defaults to never = no brand)
 *
 * When BrandName is provided, the type becomes nominally branded, preventing
 * accidental assignment of plain strings/numbers to branded types.
 * The brand is also passed to TypeAnnotation params for runtime access.
 */
export type TypeFormat<
  BaseType extends TypeFormatPrimitives,
  Name extends string,
  P extends TypeFormatParams,
  BrandName extends string = never,
> = [BrandName] extends [never] // Tuple wrapper prevents distribution over never
  ? BaseType & TypeAnnotation<Name, P>
  : Brand<BaseType, BrandName> & TypeAnnotation<Name, P & {brand: BrandName}>;
```

> **Note:** The `[BrandName] extends [never]` syntax (tuple wrapper) is required to prevent TypeScript's distributive conditional type behavior. Without it, `never extends never` would distribute and result in `never` instead of the expected branch.

#### Why passing `brand` into `TypeAnnotation` matters

When `BrandName` is provided, it's merged into the params (`P & {brand: BrandName}`), making it visible via reflection metadata. This enables runtime tooling/serialization to distinguish brands when desired.

### 3) `@mionkit/type-formats` — formats with explicit BrandName parameter ✅ DONE

Each format type should be updated to:

1. Accept an optional `BrandName` type parameter (4th parameter)
2. Pass the `BrandName` to `TypeFormat`

#### `FormatString` - Optional brand (escape hatch)

```ts
// packages/type-formats/src/string/stringFormat.runtype.ts

import {StringParams} from '@mionkit/core';
import {TypeFormat} from '@mionkit/run-types';

/** String format with optional branding. Unbranded by default. */
export type FormatString<P extends StringParams = {}, BrandName extends string = never> = TypeFormat<
  string,
  'stringFormat',
  P,
  BrandName
>;
```

#### `FormatEmail` - Fixed brand 'email'

```ts
// packages/type-formats/src/string/email.runtype.ts

import {FormatParams_Email} from '@mionkit/core';
import {TypeFormat} from '@mionkit/run-types';

/** Email format, always branded with 'email'. Brand cannot be overridden. */
export type FormatEmail<EP extends FormatParams_Email = DEFAULT_EMAIL_PARAMS> = TypeFormat<string, 'email', EP, 'email'>;
```

All other string formats (uuid/url/domain/ip/date/time/dateTime) follow the same pattern with fixed brand names that cannot be overridden. This ensures consistent type mapping across the framework for features like friendly errors and drizzle plugin.

#### `FormatNumber` and `BigintFormat` - Optional brand

```ts
// packages/type-formats/src/number/numberFormat.runtype.ts

import {NumberParams} from '@mionkit/core';
import {TypeFormat} from '@mionkit/run-types';

/** Number format with optional branding. Unbranded by default. */
export type FormatNumber<P extends NumberParams = {}, BrandName extends string = never> = TypeFormat<
  number,
  'numberFormat',
  P,
  BrandName
>;
```

```ts
// packages/type-formats/src/bigint/bigintFormat.runtype.ts

import {BigIntParams} from '@mionkit/core';
import {TypeFormat} from '@mionkit/run-types';

/** BigInt format with optional branding. Unbranded by default. */
export type BigintFormat<P extends BigIntParams = {}, BrandName extends string = never> = TypeFormat<
  bigint,
  'bigintFormat',
  P,
  BrandName
>;
```

## Usage Examples

### Server usage (validation + optional branding)

Server code can continue to use type-formats to get runtime metadata.

```ts
import type {FormatString, FormatEmail} from '@mionkit/type-formats';

// Branded string: nominal type distinction
export type UserName = FormatString<{minLength: 2; maxLength: 40}, 'UserName'>;

// Unbranded string: plain string, still has runtime annotation for validation
export type DisplayLabel = FormatString<{minLength: 1; maxLength: 60}>;

// Branded email (default brand is 'email', or you can override)
export type Email1 = FormatEmail; // branded with 'email' by default
export type CustomerEmail = FormatEmail<{}, 'CustomerEmail'>; // Brand<string, 'CustomerEmail'>
```

### Client usage (no type-formats dependency)

Client code must not use `@mionkit/type-formats`. It imports the corresponding branded aliases from `@mionkit/core`.

#### Server → Client mapping (string formats)

| Server type-format (server-only) | Client type (core-only)                                |
| -------------------------------- | ------------------------------------------------------ |
| `FormatEmail`                       | `BrandEmail`                                           |
| `FormatUUID`                        | `BrandUUID`                                            |
| `FormatUrl`                         | `BrandUrl`                                             |
| `FormatDomain`                      | `BrandDomain`                                          |
| `FormatIP`                          | `BrandIP`                                              |
| `FormatStringDate`                        | `BrandDate`                                            |
| `FormatStringTime`                        | `BrandTime`                                            |
| `FormatStringDateTime`                    | `BrandDateTime`                                        |
| `FormatString`                      | ❌ (not branded by default; no dedicated client alias) |

```ts
import type {BrandEmail, BrandUUID, BrandUrl} from '@mionkit/core';

const email: BrandEmail = 'test@example.com' as BrandEmail;
const id: BrandUUID = '...' as BrandUUID;
const url: BrandUrl = 'https://example.com' as BrandUrl;
```

## Why This Works

1. `Brand<...>` adds only a nominal marker → **no runtime overhead**.
2. `TypeAnnotation<...>` is erased at runtime types but is used by Deepkit for reflection.
3. With `BrandName = never`, format types resolve to plain base types (e.g. `string`) while still carrying annotation.
4. With `BrandName` provided, server `FormatString<{}, 'X'>` becomes structurally compatible with client `Brand<string, 'X'>`.
5. Brand is passed to TypeAnnotation params, making it accessible via `getFormatterParams` at runtime.

## Tests

Tests in `packages/run-types/src/lib/formats.spec.ts` verify:

- TypeFormat with brand has brand accessible via runtime reflection (`getFormatterParams`)
- TypeFormat without brand does not have brand in params
- Branded types work correctly with validation
