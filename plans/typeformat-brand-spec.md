# TypeFormat Brand Specification (Optional Branding)

## Goal

1. Keep **runtime format metadata** (Deepkit `TypeAnnotation`) for server-side validation/serialization.
2. Make **branding optional** via a `brand` parameter on format params.
3. Ensure clients can use **the same branded types by importing only from** `@mionkit/core` (no dependency on `@mionkit/type-formats`).

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

Also export `Brand` (and optionally `brandSymbol` + convenience aliases) from [`packages/core/index.ts`](packages/core/index.ts).

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
export type TypeFormat<FormatName extends string, BaseType, P extends object> = BrandIfProvided<BaseType, P> &
  TypeAnnotation<FormatName, P>;
```

#### Why passing `brand` into `TypeAnnotation` matters

`brand` becomes visible via Deepkit reflection metadata, enabling runtime tooling/serialization to distinguish brands when desired.

### 3) `@mionkit/type-formats` — formats accept `brand?: string`

Each format type should be updated to:

1. accept `brand?: string` in its params type, and
2. pass the fixed runtime `FormatName` explicitly.

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

export type StrEmail<P extends FormatParams_Email & {brand?: string} = {}> = TypeFormat<'email', string, P>;
```

## Usage Examples

### Server usage (validation + optional branding)

Server code can continue to use type-formats to get runtime metadata.

```ts
import type {StrFormat, StrEmail} from '@mionkit/type-formats';

// Branded string: nominal type distinction
export type UserName = StrFormat<{brand: 'UserName'; minLength: 2; maxLength: 40}>;

// Unbranded string: plain string, still has runtime annotation for validation
export type DisplayLabel = StrFormat<{minLength: 1; maxLength: 60}>;

// Branded email (still validated as email at runtime)
export type CustomerEmail = StrEmail<{brand: 'CustomerEmail'}>;
```

### Client usage (no type-formats dependency)

Client code imports only from core.

```ts
import type {Brand} from '@mionkit/core';

export type UserName = Brand<string, 'UserName'>;
export type CustomerEmail = Brand<string, 'CustomerEmail'>;

// assignment via casts or constructors/decoders
const u: UserName = 'alice' as UserName;
```

### Shared types (recommended pattern)

If you have a shared package (or a `types.ts`) consumed by both server and client:

```ts
// shared-types.ts (importable by client)
import type {Brand} from '@mionkit/core';

export type UserName = Brand<string, 'UserName'>;
export type CustomerEmail = Brand<string, 'CustomerEmail'>;
```

Then on the server, you can bind those brands to runtime formats:

```ts
// server-types.ts (server-only)
import type {StrFormat, StrEmail} from '@mionkit/type-formats';

export type UserNameFormat = StrFormat<{brand: 'UserName'; minLength: 2; maxLength: 40}>;
export type CustomerEmailFormat = StrEmail<{brand: 'CustomerEmail'}>;
```

## Why This Works

1. `Brand<...>` adds only a nominal marker (`unique symbol`) → **no runtime overhead**.
2. `TypeAnnotation<...>` is erased at runtime types but is used by Deepkit for reflection.
3. With `brand` omitted, format types resolve to plain base types (e.g. `string`) while still carrying annotation.
4. With `brand` provided, server `StrFormat<{brand: 'X'}>` becomes structurally compatible with client `Brand<string, 'X'>`.

## Files to Modify (implementation work)

1. **Create/Update**: `packages/core/src/types/formatBrands.types.ts` (add `brandSymbol`, generic `Brand`, and optional aliases)
2. **Update**: [`packages/core/index.ts`](packages/core/index.ts) (export the new types)
3. **Update**: `packages/run-types/src/lib/formats.runtype.ts` (new `TypeFormat<FormatName, BaseType, P>` signature)
4. **Update**: all format files in `packages/type-formats/src/` (pass explicit `FormatName`, accept `brand?: string`, strip it from runtime params)
