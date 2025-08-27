# BSON Serialization/Deserialization Specification

## Overview

This document specifies the implementation of BSON (Binary JSON) serialization and deserialization for the Mion run-types package. BSON provides efficient binary encoding with type preservation and field length prefixes for optimal parsing performance.

## BSON Format Benefits

### Performance Advantages

- **Field Length Prefixes**: All variable-length fields include byte length, enabling fast skipping
- **Type Identification**: Each field starts with a type byte for immediate type recognition
- **Little-Endian**: Optimized for modern x86/ARM architectures
- **No String Escaping**: Binary format eliminates JSON string escaping overhead

### TypeScript Integration

- **Type Preservation**: Native support for JavaScript/TypeScript types
- **Nested Objects**: Embedded documents for complex object structures
- **Arrays**: Efficient array representation with numeric keys
- **Binary Data**: Native support for Uint8Array, Buffer, etc.

## BSON Type Mapping

| BSON Type  | Type Code | JavaScript Type        | Description                       |
| ---------- | --------- | ---------------------- | --------------------------------- |
| Double     | 0x01      | `number` (float)       | 64-bit IEEE 754 floating point    |
| String     | 0x02      | `string`               | UTF-8 string with length prefix   |
| Document   | 0x03      | `object`               | Embedded BSON document            |
| Array      | 0x04      | `Array<T>`             | Document with numeric string keys |
| Binary     | 0x05      | `Uint8Array`, `Buffer` | Binary data with subtype          |
| Undefined  | 0x06      | `undefined`            | Deprecated, use Null              |
| ObjectId   | 0x07      | N/A                    | 12-byte MongoDB ObjectId          |
| Boolean    | 0x08      | `boolean`              | Single byte: 0x00 or 0x01         |
| DateTime   | 0x09      | `Date`                 | UTC milliseconds since epoch      |
| Null       | 0x0A      | `null`                 | No data                           |
| Regex      | 0x0B      | `RegExp`               | Pattern + flags as cstrings       |
| Int32      | 0x10      | `number` (int)         | 32-bit signed integer             |
| Timestamp  | 0x11      | N/A                    | MongoDB internal timestamp        |
| Int64      | 0x12      | `number`, `bigint`     | 64-bit signed integer             |
| Decimal128 | 0x13      | N/A                    | 128-bit decimal (future)          |

## Document Structure

### BSON Document Format

```
document ::= int32 e_list 0x00
```

Where:

- `int32`: Total document size in bytes (including this field)
- `e_list`: Zero or more elements
- `0x00`: Document terminator

### Element Format

```
element ::= type_byte e_name value
```

Where:

- `type_byte`: Single byte indicating BSON type
- `e_name`: Field name as null-terminated UTF-8 string
- `value`: Type-specific value encoding

## Type-Specific Encoding

### Primitive Types

#### String (0x02)

```
string ::= int32 (byte*) 0x00
```

- `int32`: String length in bytes (including null terminator)
- `(byte*)`: UTF-8 encoded string data
- `0x00`: Null terminator

#### Number

- **Integers (-2³¹ to 2³¹-1)**: Use Int32 (0x10)
- **Large Integers**: Use Int64 (0x12) or BigInt conversion
- **Floats**: Use Double (0x01)

#### Boolean (0x08)

- `0x00`: false
- `0x01`: true

#### Null (0x0A)

- No value data

### Complex Types

#### Object (0x03)

Encoded as embedded BSON document with same structure as root document.

#### Array (0x04)

Encoded as BSON document where keys are string representations of array indices:

```javascript
['red', 'blue'] → {'0': 'red', '1': 'blue'}
```

#### Binary Data (0x05)

```
binary ::= int32 subtype (byte*)
```

- `int32`: Number of bytes in data
- `subtype`: Binary subtype (0x00 for generic)
- `(byte*)`: Raw binary data

## TypeScript-Specific Mappings

### Leveraging Existing JSON Functions

The Mion run-types package already handles complex TypeScript features through existing JSON serialization functions. These implementations serve as excellent references for BSON:

#### Reference Functions

- **`jsonStringify`**: Direct serialization of TypeScript features to JSON strings
- **`toJsonVal`**: Converts TypeScript features to JSON-compatible objects (spread across RunType classes)
- **`fromJsonVal`**: Restores TypeScript features from JSON-compatible objects (spread across RunType classes)

#### TypeScript Features Already Handled

**Maps and Sets**:

```typescript
// Map<K,V> → Array<[K,V]> (toJsonVal) → BSON Array of tuples
// Set<T> → Array<T> (toJsonVal) → BSON Array
```

**Union Types**:

```typescript
// Discriminated unions use type field for variant identification
// Primitive unions encode based on runtime type detection
```

**Complex Collections**:

```typescript
// Tuples → Arrays with fixed length validation
// Records → Objects with dynamic key validation
// Classes → Objects with constructor information
```

**Advanced Types**:

```typescript
// Branded types → Underlying type preservation
// Literal types → Direct value encoding
// Optional properties → Omitted if undefined
// Function types → Serialized as code strings (via toCode)
```

### BSON Implementation Strategy

1. **Reuse JSON Logic**: Leverage existing `toJsonVal`/`fromJsonVal` transformations
2. **Direct BSON Encoding**: Skip JSON intermediate step for better performance
3. **Type Preservation**: Maintain TypeScript semantics in binary format

#### Example: Map Serialization

```typescript
// Current JSON approach:
Map<string, number> → toJsonVal → [["key1", 1], ["key2", 2]] → JSON

// BSON approach:
Map<string, number> → BSON Array of BSON Documents [{"k": "key1", "v": 1}, {"k": "key2", "v": 2}]
```

#### Example: Union Type Serialization

```typescript
// Current JSON approach:
type User = {type: "admin", permissions: string[]} | {type: "user", name: string}
→ toJsonVal → {type: "admin", permissions: [...]} → JSON

// BSON approach:
→ BSON Document with discriminator field preserved in binary format
```

### Implementation Benefits

- **Proven Logic**: Reuse battle-tested TypeScript feature handling
- **Performance Gain**: Direct binary encoding without JSON intermediate step
- **Type Safety**: Maintain existing validation and error handling patterns
- **Consistency**: Same behavior as JSON functions but in binary format

## Performance Optimizations

### JIT Compilation Strategy

1. **Type-Specific Functions**: Generate optimized code per RunType
2. **Inline Field Access**: Direct property access without iteration
3. **Pre-calculated Sizes**: Compute buffer sizes when possible
4. **Minimal Allocations**: Reuse buffers and avoid temporary objects

### Buffer Management

- **Pre-sized Buffers**: Calculate approximate size before encoding
- **Growth Strategy**: Double buffer size when needed
- **Pooling**: Reuse buffers for repeated operations

## Error Handling

### Serialization Errors

- **Unsupported Types**: Throw descriptive error with type information
- **Circular References**: Detect and report circular object references
- **Size Limits**: Enforce BSON document size limits (16MB default)

### Deserialization Errors

- **Malformed Data**: Validate BSON structure and type consistency
- **Type Mismatches**: Report expected vs actual types
- **Buffer Overruns**: Validate all length fields and bounds

## Implementation Files

### Core Functions

- `toBSON.ts`: BSON serialization JIT compiler
- `fromBSON.ts`: BSON deserialization JIT compiler
- `bsonUtils.ts`: Shared utilities and constants

### Utility Functions

- Buffer writing/reading helpers
- Type detection and validation
- Size calculation utilities
- Error message formatting

## Compatibility

### BSON Specification Compliance

- Follows BSON 1.1 specification
- Compatible with MongoDB BSON libraries
- Supports standard BSON tools and viewers

### JavaScript Environment Support

- Node.js: Full support with Buffer API
- Browser: Support via Uint8Array and DataView
- TypeScript: Full type safety and inference
