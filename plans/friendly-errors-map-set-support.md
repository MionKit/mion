# FriendlyErrors Map/Set Support Design

## Overview

This document outlines the design for extending `FriendlyErrors` type to support:

1. Top-level array types (fixing the immediate issue)
2. Map types with separate `$key` and `$value` handlers
3. Set types with `$item` handler

## Current Error Path Structure

Based on investigation of the codebase:

### Arrays

```typescript
// path: [0], [1], ['tags', 2]
{path: ['tags', 0], expected: 'string'}
```

### Maps

```typescript
// Key error: path contains object with failed: 'mapKey'
{path: [{key: 1, index: 0, failed: 'mapKey'}], expected: 'string'}

// Value error: path contains object with failed: 'mapVal'
{path: [{key: 'one', index: 0, failed: 'mapVal'}], expected: 'number'}
```

### Sets

```typescript
// Item error: path contains object with key and index
{path: [{key: 51, index: 0}], expected: 'string'}
```

## Proposed Type Design

### FriendlyErrors Type

```typescript
// Helper types for Map/Set handlers
type MapErrorHandlers<K, V> = {
  $key?: FriendlyErrorHandler<K>; // Handler for key validation errors
  $value?: FriendlyErrors<V> | FriendlyErrorHandler<V>; // Handler or nested map for value errors
};

type SetErrorHandlers<T> = {
  $item?: FriendlyErrors<T> | FriendlyErrorHandler<T>; // Handler for item validation errors
};

// Main FriendlyErrors type
export type FriendlyErrors<T> =
  // Top-level array: allow handler or nested map
  T extends (infer U)[]
    ? FriendlyErrors<U> | FriendlyErrorHandler<U>
    : // Top-level Map: allow handlers for key/value
      T extends Map<infer K, infer V>
      ? MapErrorHandlers<K, V> | FriendlyErrorHandler<V>
      : // Top-level Set: allow handler for items
        T extends Set<infer U>
        ? SetErrorHandlers<U> | FriendlyErrorHandler<U>
        : // Object type: map properties to handlers
          {
            [P in keyof T]?: T[P] extends (infer U)[]
              ? FriendlyErrors<U> | FriendlyErrorHandler<U>
              : T[P] extends Map<infer K, infer V>
                ? MapErrorHandlers<K, V> | FriendlyErrorHandler<V>
                : T[P] extends Set<infer U>
                  ? SetErrorHandlers<U> | FriendlyErrorHandler<U>
                  : T[P] extends object
                    ? FriendlyErrors<T[P]> | FriendlyErrorHandler<T[P]>
                    : FriendlyErrorHandler<T[P]>;
          };
```

### FriendlyErrorsResult Type

```typescript
export type FriendlyErrorsResult<T> =
  // Array: Record of index -> error message or nested result
  T extends (infer U)[]
    ? Record<StrNumber, U extends object ? FriendlyErrorsResult<U> : string>
    : // Map: Separate key and value error records
      T extends Map<infer K, infer V>
      ? {
          $keys?: Record<StrNumber, string>; // Key errors by index
          $values?: Record<StrNumber, V extends object ? FriendlyErrorsResult<V> : string>; // Value errors by index
        }
      : // Set: Record of index -> error message or nested result
        T extends Set<infer U>
        ? Record<StrNumber, U extends object ? FriendlyErrorsResult<U> : string>
        : // Object: Nested structure
          T extends object
          ? {
              [P in keyof T]?: T[P] extends (infer U)[]
                ? Record<StrNumber, U extends object ? FriendlyErrorsResult<U> : string>
                : T[P] extends Map<infer K, infer V>
                  ? {
                      $keys?: Record<StrNumber, string>;
                      $values?: Record<StrNumber, V extends object ? FriendlyErrorsResult<V> : string>;
                    }
                  : T[P] extends Set<infer U>
                    ? Record<StrNumber, U extends object ? FriendlyErrorsResult<U> : string>
                    : T[P] extends object
                      ? FriendlyErrorsResult<T[P]>
                      : string;
            } & {
              $root?: string;
            }
          : string;
```

## Usage Examples

### Top-level Array (fixing original issue)

```typescript
type Tags = string[];
const errorsMap: FriendlyErrors<Tags> = (params) => `Item ${params.index} is invalid`;
```

### Map with separate handlers

```typescript
type UserMap = Map<string, User>;
const errorsMap: FriendlyErrors<UserMap> = {
  $key: (params) => 'Invalid user ID format',
  $value: {
    name: (params) => 'Name is required',
    email: (params) => 'Invalid email format',
  },
};

// Result structure:
// {
//   $keys: { 0: 'Invalid user ID format' },
//   $values: { 1: { name: 'Name is required' } }
// }
```

### Set with handler

```typescript
type TagSet = Set<string>;
const errorsMap: FriendlyErrors<TagSet> = {
  $item: (params) => `Tag at index ${params.index} is invalid`,
};

// Or simple handler:
const errorsMap2: FriendlyErrors<TagSet> = (params) => `Invalid tag`;

// Result structure:
// { 0: 'Tag at index 0 is invalid', 2: 'Invalid tag' }
```

### Object with Map property

```typescript
type User = {
  name: string;
  settings: Map<string, boolean>;
};

const errorsMap: FriendlyErrors<User> = {
  name: (params) => 'Name is required',
  settings: {
    $key: (params) => 'Invalid setting key',
    $value: (params) => 'Setting must be boolean',
  },
};
```

## Implementation Changes Required

### 1. Update `friendlyErrors.types.ts`

- Add `MapErrorHandlers<K, V>` type
- Add `SetErrorHandlers<T>` type
- Update `FriendlyErrors<T>` to handle arrays, Maps, Sets at top level and nested
- Update `FriendlyErrorsResult<T>` to include `$keys` and `$values` for Maps

### 2. Update `friendlyErrors.ts`

- Update `getHandler()` to recognize Map/Set path objects
- Update path handling to detect `failed: 'mapKey'` vs `failed: 'mapVal'`
- Update result building to create `$keys`/`$values` structure for Maps
- Handle Set items similar to arrays but with object paths

### 3. Add tests in `friendlyErrors.spec.ts`

- Test Map with key errors
- Test Map with value errors
- Test Map with nested value objects
- Test Set with item errors
- Test nested Map/Set in objects

## Path Detection Logic

```typescript
function isMapKeyPath(pathSegment: unknown): pathSegment is {key: unknown; index: number; failed: 'mapKey'} {
  return typeof pathSegment === 'object' && pathSegment !== null && 'failed' in pathSegment && pathSegment.failed === 'mapKey';
}

function isMapValuePath(pathSegment: unknown): pathSegment is {key: unknown; index: number; failed: 'mapVal'} {
  return typeof pathSegment === 'object' && pathSegment !== null && 'failed' in pathSegment && pathSegment.failed === 'mapVal';
}

function isSetItemPath(pathSegment: unknown): pathSegment is {key: unknown; index: number} {
  return (
    typeof pathSegment === 'object' &&
    pathSegment !== null &&
    'key' in pathSegment &&
    'index' in pathSegment &&
    !('failed' in pathSegment)
  );
}
```

## Notes

- The `$key`, `$value`, and `$item` prefixes with `$` are used to avoid conflicts with actual property names
- Map results use index as key (not the actual map key) because map keys can be complex objects
- The implementation should gracefully fall back to `defaultErrorPrinter` when no handler is provided
