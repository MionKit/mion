# Binary Serialization/Deserialization Specification

## Overview

This document specifies the implementation of JIT Binary serialization and deserialization for the Mion run-types package.
All binary serialization and deserialization functions are based on the [seqproto](https://github.com/oramasearch/seqproto) library that is highly optimized for js engines and multi-platform.

This spec is designed to work and support all TypeScript features, like Unions, Intersections, etc. while leveraging seqproto's high-performance encoding strategies.

All data is encoded/decoded into a single [Uint8Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) using **32-bit aligned** memory access patterns for optimal CPU performance.

## SeqProto Alignment Strategy

Following seqproto's approach, all data is **32-bit aligned** (4-byte boundaries) for optimal performance:

- **Index tracking**: All positions tracked in 32-bit units
- **Memory access**: Direct typed array access (`uint32Array[index]`, `float32Array[index]`)
- **String encoding**: Uses `TextEncoder.encodeInto()` for zero-allocation encoding
- **Buffer management**: Pre-allocated reusable buffers with simple index reset

All functions used for encoding/decoding follow seqproto's optimized patterns and can be used in any JavaScript environment.

## Headers and Type Markers

Some variable length types and object properties require additional information. For these cases, we use **32-bit type markers** to indicate the length or type of the data that follows.

### SeqProto Type Headers (32-bit aligned)

SeqProto uses type markers for number encoding. All headers are 32-bit values:

| Header        | Value | Description             |
| ------------- | ----- | ----------------------- |
| `TYPE_FLOAT`  | 0     | 32-bit IEEE 754 float   |
| `TYPE_UINT32` | 1     | 32-bit unsigned integer |
| `TYPE_INT32`  | 2     | 32-bit signed integer   |

### Object Property Headers (Mion-specific)

SeqProto doesn't handle object properties, so we define our own property encoding system:

| Header Type          | Bit Layout                    | Description                                                                                          | Max Values       |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------- |
| **Known Property**   | no header required            | Index of the property in the Type definition, optional props that are not defined are not serialized | 65536 properties |
| **Unknown Property** | `[length + string prop name]` | Dynamic property name                                                                                | Unlimited        |

### Arrays

| Collection | Bit Layout            | Description                          |
| ---------- | --------------------- | ------------------------------------ |
| **Array**  | `[length + elements]` | Length as uint32, number of elements |

### Number Types (Type-Aware Encoding)

Following seqproto's number encoding strategy:

| Type                   | Bytes | Bit Layout              | Notes                           |
| ---------------------- | ----- | ----------------------- | ------------------------------- |
| **Integer (positive)** | 4     | `TYPE_UINT32` + `value` | `value >= 0 && value % 1 === 0` |
| **Integer (negative)** | 4     | `TYPE_INT32` + `value`  | `value < 0 && value % 1 === 0`  |
| **Float**              | 4     | `TYPE_FLOAT` + `value`  | `value % 1 !== 0`               |
| **BigInt**             | 8     | `TYPE_BIGINT` + `value` |                                 |

### Primitive Types (32-bit Aligned)

| Type          | Bytes | Notes                                                             |
| ------------- | ----- | ----------------------------------------------------------------- |
| **Boolean**   | 4     | 32-bit aligned for performance                                    |
| **Null**      | 4     | null is serialized as 0                                           |
| **Undefined** | 4     | undefined is serialized as -1, undefined props are not serialized |
| **Date**      | 8     | serialized as number                                              |

### String Types (Zero-Allocation Encoding)

| Type       | Bit Layout          | Notes                 |
| ---------- | ------------------- | --------------------- |
| **String** | `[length, content]` | byte length is 32 bit |
| **RegExp** | `[source, flags]`   |                       |

## Complex Types (SeqProto-Compatible)

### Collection Types

| Type       | Encoding Strategy                                                                          | Notes                            |
| ---------- | ------------------------------------------------------------------------------------------ | -------------------------------- |
| **Array**  | `uint32Array[index++] = TYPE_ARRAY; uint32Array[index++] = length; [encode each element]`  | Length + elements                |
| **Object** | `uint32Array[index++] = TYPE_OBJECT; uint32Array[index++] = propCount; [encode each prop]` | Property count + key-value pairs |
| **Map**    | Serialize as Array of `[key, value]` tuples                                                | Use seqproto function            |
| **Set**    | Serialize as Array of values                                                               | Use seqproto function            |
| **Class**  | Serialize as data only, functions are not serialized.                                      | Use object function              |

### Object Serialization

Object are serialized with all required props in order, this guarantee fast and simple sequential serialization/deserialization.
Optional props are serialized as [`optional props bitmap + optional props values`].
The bitmap for optional props is variable length but determined at compile time depending on the number of optional props min length is 4 bytes, and then the optional props.
Each bit in the bitmap represents whether the corresponding optional prop is present or not. so the number of optional props corresponds to the number of bits to 1 in the bitmap.

### Object Properties (32-bit Aligned)

| Property Type          | Bit Layout                                        | Encoding                                    | Notes                                              |
| ---------------------- | ------------------------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| **Non Optional props** | `value`                                           | `[encode value]`                            | Serialized in order they are declared in the type. |
| **Optional props**     | `[optional props bitmap + optional props values]` |                                             |                                                    |
| **Unknown Props**      | `[string prop name + value]`                      | `serializeString(propName); [encode value]` | used inIndexSignature or Records                   |

### TypeScript Features

| Feature           | Encoding Strategy                                                                              | Notes              |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------------------ |
| **Union Types**   | `uint32Array[index++] = TYPE_UNION; uint32Array[index++] = discriminatorIndex; [encode value]` | Type index + value |
| **Tuple**         | Serialize as Array                                                                             | Fixed-length array |
| **Enum**          | `[type, value]` where type indicates string or number                                          |                    |
| **Literal Types** | Serialize underlying value                                                                     |                    |

#### TypeScript Features

**Maps and Sets**:

```typescript
// Map<K,V> → Array<[K,V]>  → Binary Array of tuples [K,V]
// Set<T> → Array<T> → Binary Array
```

**Union Types**:

```typescript
// Discriminated unions use type field for variant identification
// Primitive unions encode based on runtime type detection
// [discriminator, value]
```

**Complex Collections**:

```typescript
// Tuples → Arrays with fixed length validation
// Records → Objects with dynamic key validation
// Classes → Objects with constructor information
```
