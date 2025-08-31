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

| Header        | Value | Description             | Usage                           |
| ------------- | ----- | ----------------------- | ------------------------------- |
| `TYPE_FLOAT`  | 0     | 32-bit IEEE 754 float   | `value % 1 !== 0`               |
| `TYPE_UINT32` | 1     | 32-bit unsigned integer | `value >= 0 && value % 1 === 0` |
| `TYPE_INT32`  | 2     | 32-bit signed integer   | `value < 0 && value % 1 === 0`  |

### Object Property Headers (Mion-specific)

SeqProto doesn't handle object properties, so we define our own property encoding system:

| Header Type          | Bit Layout                    | Description                                                                                          | Max Values       |
| -------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------- |
| **Known Property**   | `[16-bit prop index]`         | Index of the property in the Type definition, optional props that are not defined are not serialized | 65536 properties |
| **Unknown Property** | `[length + string prop name]` | Dynamic property name                                                                                | Unlimited        |

### Collection Headers

| Collection | Bit Layout                   | Description                            |
| ---------- | ---------------------------- | -------------------------------------- |
| **Array**  | `[length + elements]`        | Length as uint32, then elements        |
| **Object** | `[length + key-value pairs]` | length as uint32, then key-value pairs |

### Number Types (Type-Aware Encoding)

Following seqproto's intelligent number encoding strategy:

| Type                   | Bytes | Encoding                                                                        | JIT Code | Notes                           |
| ---------------------- | ----- | ------------------------------------------------------------------------------- | -------- | ------------------------------- |
| **Integer (positive)** | 4     | `uint32Array[index++] = TYPE_UINT32; uint32Array[index++] = value`              | ✅       | `value >= 0 && value % 1 === 0` |
| **Integer (negative)** | 4     | `uint32Array[index++] = TYPE_INT32; uint32Array[index++] = POW_2_32 + value`    | ✅       | `value < 0 && value % 1 === 0`  |
| **Float**              | 4     | `uint32Array[index++] = TYPE_FLOAT; float32Array[index++] = value`              | ✅       | `value % 1 !== 0`               |
| **BigInt**             | 8     | `uint32Array[index++] = TYPE_BIGINT; setBigInt64(index * 4, value); index += 2` | ❌       | Use seqproto function           |

### Primitive Types (32-bit Aligned)

| Type          | Bytes | Encoding                                                                                | JIT Code | Notes                          |
| ------------- | ----- | --------------------------------------------------------------------------------------- | -------- | ------------------------------ |
| **Boolean**   | 4     | `uint32Array[index++] = value ? 1 : 0`                                                  | ✅       | 32-bit aligned for performance |
| **Null**      | 4     | `uint32Array[index++] = TYPE_NULL`                                                      | ✅       | Type marker only               |
| **Undefined** | 4     | `uint32Array[index++] = TYPE_UNDEFINED`                                                 | ✅       | Type marker only               |
| **Date**      | 8     | `uint32Array[index++] = TYPE_DATE; setBigInt64(index * 4, value.getTime()); index += 2` | ❌       | Use seqproto function          |

### String Types (Zero-Allocation Encoding)

| Type       | Encoding                                                                                        | JIT Code | Notes                 |
| ---------- | ----------------------------------------------------------------------------------------------- | -------- | --------------------- |
| **String** | `uint32Array[index] = length; encodeInto(str, uint8View(index+1)); index += ceil(length/4) + 1` | ❌       | Use seqproto function |
| **RegExp** | Serialize as `[source: string, flags: string]` object                                           | ❌       | Use seqproto function |

## Complex Types (SeqProto-Compatible)

### Collection Types

| Type       | Encoding Strategy                                                                          | JIT Code | Notes                            |
| ---------- | ------------------------------------------------------------------------------------------ | -------- | -------------------------------- |
| **Array**  | `uint32Array[index++] = TYPE_ARRAY; uint32Array[index++] = length; [encode each element]`  | ✅       | Length + elements                |
| **Object** | `uint32Array[index++] = TYPE_OBJECT; uint32Array[index++] = propCount; [encode each prop]` | ✅       | Property count + key-value pairs |
| **Map**    | Serialize as Array of `[key, value]` tuples                                                | ❌       | Use seqproto function            |
| **Set**    | Serialize as Array of values                                                               | ❌       | Use seqproto function            |
| **Class**  | Serialize as data only, functions are not serialized.                                      | ✅       | Use object function              |

### Object Properties (32-bit Aligned)

| Property Type      | Encoding                                                                           | JIT Code | Notes                        |
| ------------------ | ---------------------------------------------------------------------------------- | -------- | ---------------------------- |
| **Known Required** | `uint32Array[index++] = propIndex; [encode value]`                                 | ✅       | Direct property index        |
| **Known Optional** | `uint32Array[index++] = (isDefined << 31) \| propIndex; [encode value if defined]` | ✅       | Bit-packed existence + index |
| **Unknown Props**  | `serializeString(propName); [encode value]`                                        | ❌       | Use seqproto string function |

### TypeScript Features

| Feature           | Encoding Strategy                                                                              | JIT Code | Notes                      |
| ----------------- | ---------------------------------------------------------------------------------------------- | -------- | -------------------------- |
| **Union Types**   | `uint32Array[index++] = TYPE_UNION; uint32Array[index++] = discriminatorIndex; [encode value]` | ✅       | Type index + value         |
| **Intersection**  | Serialize as merged object                                                                     | ✅       | Flatten all properties     |
| **Tuple**         | Serialize as Array with length validation                                                      | ✅       | Fixed-length array         |
| **Enum**          | Serialize as appropriate number type                                                           | ✅       | Use number encoding rules  |
| **Literal Types** | Serialize underlying value                                                                     | ✅       | No special encoding needed |

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
