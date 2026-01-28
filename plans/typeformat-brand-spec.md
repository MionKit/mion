# TypeFormat Brand Specification

## Goal

Allow clients to import branded types from `@mionkit/core` without depending on `@mionkit/type-formats`.

## Architecture

```
@mionkit/core
└── Brand<BaseType, Name> + BrandString, NumBrand, etc.

@mionkit/run-types
└── TypeFormat<Brand, P> (uses Brand from core)

@mionkit/type-formats
└── StrFormat<P> = TypeFormat<BrandString, P>
```

## Implementation

### 1. Core Package - Brand Types

```typescript
// @mionkit/core/src/types/formatBrands.types.ts

/** Base branded type - combines BaseType with format name */
export type Brand<BaseType extends string | number | bigint, Name extends string> = BaseType & {format: Name};

// String brands
export type BrandString = Brand<string, 'string'>;
export type BrandEmail = Brand<string, 'email'>;
export type BrandUUID = Brand<string, 'uuid'>;
export type BrandUrl = Brand<string, 'url'>;
export type BrandDomain = Brand<string, 'domain'>;
export type BrandIP = Brand<string, 'ip'>;
export type BrandDate = Brand<string, 'date'>;
export type BrandTime = Brand<string, 'time'>;
export type BrandDateTime = Brand<string, 'dateTime'>;

// Number brands
export type NumBrand = Brand<number, 'number'>;

// BigInt brands
export type BigIntBrand = Brand<bigint, 'bigint'>;
```

### 2. Run-Types Package - TypeFormat

```typescript
// @mionkit/run-types/src/lib/formats.runtype.ts

import {TypeAnnotation} from '@deepkit/core';
import type {TypeFormatParams, Brand} from '@mionkit/core';

/** TypeFormat uses Brand and adds TypeAnnotation for deepkit reflection */
export type TypeFormat<B extends Brand<string | number | bigint, string>, P extends TypeFormatParams> = B &
  TypeAnnotation<B['format'], P>;
```

### 3. Type-Formats Package - Format Types

```typescript
// @mionkit/type-formats/src/string/stringFormat.runtype.ts

import type {BrandString, StringParams} from '@mionkit/core';
import type {TypeFormat} from '@mionkit/run-types';

export type StrFormat<P extends StringParams> = TypeFormat<BrandString, P>;
```

```typescript
// @mionkit/type-formats/src/string/emailFormat.runtype.ts

import type {BrandEmail, FormatParams_Email} from '@mionkit/core';
import type {TypeFormat} from '@mionkit/run-types';

export type StrEmail<P extends FormatParams_Email = {}> = TypeFormat<BrandEmail, P>;
```

## Client Usage

```typescript
// Client code - imports from core only
import type {BrandString, BrandEmail} from '@mionkit/core';

// These are the same structural types as StrFormat/StrEmail
const email: BrandEmail = 'test@example.com' as BrandEmail;
const name: BrandString = 'John' as BrandString;
```

## Why This Works

```typescript
// From @mionkit/core (client)
type BrandEmail = string & {format: 'email'};

// From @mionkit/type-formats (server)
type StrEmail = TypeFormat<BrandEmail, P>;
// Expands to: BrandEmail & TypeAnnotation<'email', P>
// = (string & {format: 'email'}) & unknown
// = string & {format: 'email'}

// ✅ Structurally identical - clients can use BrandEmail
```

## Files to Modify

1. **Create**: `packages/core/src/types/formatBrands.types.ts`
2. **Update**: `packages/core/index.ts` - export new types
3. **Update**: `packages/run-types/src/lib/formats.runtype.ts` - new TypeFormat signature
4. **Update**: All format files in `packages/type-formats/src/` - use brands from core
