# TypeFormat Brand Specification (Optional Branding)

## Goal

1. Keep **runtime format metadata** (Deepkit `TypeAnnotation`) for server-side validation/serialization.
2. Make **branding optional** via a `brand` parameter on format params.
3. Ensure clients can use **the same branded types by importing only from** `@mionkit/core` (no dependency on `@mionkit/type-formats`).

## Additional Requirements

1. **All string type-formats must be branded by default, except `StrFormat` itself.**
   - Examples: `StrEmail`, `StrUUID`, `StrUrl`, `StrDomain`, `StrIP`, `StrDate`, `StrTime`, `StrDateTime` should all produce branded string types even if the caller does not specify `brand`.
   - `StrFormat` remains the "escape hatch" and is unbranded unless `brand` is explicitly provided.
2. **All format param types must include `brand?: string`** (even if a given format supplies a default brand).

### Desired API

```ts
const myCustomString = StrFormat<{brand: 'custom'; minLength: 10}>; // branded (nominal)
const myCustomString2 = StrFormat<{minLength: 10}>; // not branded (plain string)
```

## Key Design Decision

**Decouple "format" (runtime validation identity) from "brand" (TypeScript nominal typing).**

- `format` should remain stable and known to the runtime validator (e.g. `'string'`, `'email'`, `'uuid'`).
- `brand` should be a purely type-level addition that can be enabled/disabled per usage.

## Architecture

```
@mionkit/core
└── Brand<BaseType, Name> (generic) + optional pre-defined brands

@mionkit/run-types
└── TypeFormat<FormatName, BaseType, P>
    - adds TypeAnnotation<FormatName, P> (including P.brand)
    - conditionally adds Brand<BaseType, P.brand>

@mionkit/type-formats
└── StrFormat<P> = TypeFormat<'string', string, P>
└── StrEmail<P>  = TypeFormat<'email',  string, P>
    ...
```

## Implementation

### 1) `@mionkit/core` — Brand types (generic + pre-defined)

Create a brand type that is **purely nominal** (does not introduce runtime properties).

```ts
export type TypeFormatParams = Record<string, TypeFormatValue | undefined | never> & {brand?: string};
```

```ts
// packages/core/src/types/formatBrands.types.ts

/** unique symbol used to make brands nominal without runtime fields **/
export declare const brandSymbol: unique symbol;

/** Nominal brand helper: Brand<string, 'UserName'> */
export type Brand<BaseType, Name extends string> = BaseType & {
  readonly [brandSymbol]?: Name;
};

// Optional convenience aliases (kept for ergonomics; not required)
export type BrandString = Brand<string, 'string'>;
export type BrandEmail = Brand<string, 'email'>;
export type BrandUUID = Brand<string, 'uuid'>;
export type BrandUrl = Brand<string, 'url'>;
export type BrandDomain = Brand<string, 'domain'>;
export type BrandIP = Brand<string, 'ip'>;
export type BrandDate = Brand<string, 'date'>;
export type BrandTime = Brand<string, 'time'>;
export type BrandDateTime = Brand<string, 'dateTime'>;
export type BrandNumber = Brand<number, 'number'>;
export type BrandBigInt = Brand<bigint, 'bigint'>;
```

Also export `Brand` (and convenience aliases) from [`packages/core/index.ts`](packages/core/index.ts).

### 2) `@mionkit/run-types` — TypeFormat with optional `brand`

Add a `brand?: string` parameter to the format params and pass it through to runtime annotation params so brand information is available at runtime.

```ts
// packages/run-types/src/lib/formats.runtype.ts

import {TypeAnnotation} from '@deepkit/core';
import type {Brand} from '@mionkit/core';

/**
 * Helper that conditionally brands based on P.brand.
 * If P has no brand, this resolves to BaseType.
 */
type BrandIfProvided<BaseType, P> = P extends {brand: infer B extends string} ? Brand<BaseType, B> : BaseType;

/**
 * TypeFormat attaches runtime annotation for FormatName + params,
 * and optionally adds a compile-time Brand.
 */
export type TypeFormat<FormatName extends string, BaseType, P extends TypeFormatParams> = BrandIfProvided<BaseType, P> &
  TypeAnnotation<FormatName, P>;
```

#### Why passing `brand` into `TypeAnnotation` matters

`brand` becomes visible via Deepkit reflection metadata, enabling runtime tooling/serialization to distinguish brands when desired.

### 3) `@mionkit/type-formats` — formats accept `brand?: string`

Each format type should be updated to:

1. accept `brand?: string` in its params type, and
2. pass the fixed runtime `FormatName` explicitly.

#### Default branding for string formats (except `StrFormat`)

To satisfy the "branded-by-default" requirement for string formats other than `StrFormat`, use a helper that injects a default `brand` when it is not provided.

```ts
// packages/type-formats/src/string/_stringBranding.types.ts (suggested)

/** Adds a default brand if caller didn't provide one */
export type WithDefaultBrand<P, Default extends string> = P extends {brand: infer B extends string} ? P : P & {brand: Default};
```

```ts
// packages/type-formats/src/string/stringFormat.runtype.ts

import type {StringParams} from '@mionkit/core';
import type {TypeFormat} from '@mionkit/run-types';

export type StrFormat<P extends StringParams & {brand?: string} = {}> = TypeFormat<'string', string, P>;
```

```ts
// packages/type-formats/src/string/email.runtype.ts

import type {FormatParams_Email} from '@mionkit/core';
import type {TypeFormat} from '@mionkit/run-types';
import type {WithDefaultBrand} from './_stringBranding.types';

// Branded by default (brand = 'email') unless caller overrides `brand`
export type StrEmail<P extends FormatParams_Email & {brand?: string} = {}> = TypeFormat<
  'email',
  string,
  WithDefaultBrand<P, 'email'>
>;
```

Repeat the same pattern for all other string formats (uuid/url/domain/ip/date/time/dateTime), using their respective default brand string.

## Usage Examples

### Server usage (validation + optional branding)

Server code can continue to use type-formats to get runtime metadata.

```ts
import type {StrFormat, StrEmail} from '@mionkit/type-formats';

// Branded string: nominal type distinction
export type UserName = StrFormat<{brand: 'UserName'; minLength: 2; maxLength: 40}>;

// Unbranded string: plain string, still has runtime annotation for validation
export type DisplayLabel = StrFormat<{minLength: 1; maxLength: 60}>;

// Branded email (default brand is 'email', or you can override)
export type Email1 = StrEmail; // branded by default
export type CustomerEmail = StrEmail<{brand: 'CustomerEmail'}>; // Brand<string, 'CustomerEmail'>
```

### Client usage (no type-formats dependency)

Client code must not use `@mionkit/type-formats`. It imports the corresponding branded aliases from `@mionkit/core`.

#### Server → Client mapping (string formats)

| Server type-format (server-only) | Client type (core-only)                                |
| -------------------------------- | ------------------------------------------------------ |
| `StrEmail`                       | `BrandEmail`                                           |
| `StrUUIDv4`                      | `BrandUUIDv4`                                          |
| `StrUUIDv7`                      | `BrandUUIDv7`                                          |
| `StrURL`                         | `BrandUrl`                                             |
| `StrDomain`                      | `BrandDomain`                                          |
| `StrIP`                          | `BrandIP`                                              |
| `StrDate`                        | `BrandDate`                                            |
| `StrTime`                        | `BrandTime`                                            |
| `StrDateTime`                    | `BrandDateTime`                                        |
| `StrFormat`                      | ❌ (not branded by default; no dedicated client alias) |

```ts
import type {BrandEmail, BrandUUIDv4, BrandUrl} from '@mionkit/core';

const email: BrandEmail = 'test@example.com' as BrandEmail;
const id: BrandUUIDv4 = '...' as BrandUUIDv4;
const url: BrandUrl = 'https://example.com' as BrandUrl;
```

## Why This Works

1. `Brand<...>` adds only a nominal marker → **no runtime overhead**.
2. `TypeAnnotation<...>` is erased at runtime types but is used by Deepkit for reflection.
3. With `brand` omitted, format types resolve to plain base types (e.g. `string`) while still carrying annotation.
4. With `brand` provided, server `StrFormat<{brand: 'X'}>` becomes structurally compatible with client `Brand<string, 'X'>`.

For string formats other than `StrFormat`, a default `brand` is injected so they remain branded even when callers omit `brand`.
