# BSON Implementation Details

## Implementation Overview

This document outlines the detailed implementation plan for BSON serialization/deserialization in the Mion run-types package using JIT compilation.

## Required Changes

### 1. Constants and Types Updates

#### File: `packages/run-types/src/constants.functions.ts`

**Status: ✅ COMPLETED**

Added new BSON functions to `jitSerializationFunctions`:

```typescript
toBSON: {
    id: 'tbs',
    name: 'toBSON',
    type: CodeTypes.expression,
    jitArgs,
    jitDefaultArgs,
},
fromBSON: {
    id: 'fbs',
    name: 'fromBSON',
    type: CodeTypes.statement,
    jitArgs,
    jitDefaultArgs,
},
```

#### File: `packages/core/src/types.ts`

**Status: ⏳ TODO**

Update type definitions:

```typescript
// Add to JitCompiledFunctions interface
export interface JitCompiledFunctions {
  isType: JitCompiledFn<IsTypeFn>;
  typeErrors: JitCompiledFn<TypeErrorsFn>;
  toJsonVal: JitCompiledFn<ToJsonValFn>;
  fromJsonVal: JitCompiledFn<FromJsonValFn>;
  jsonStringify: JitCompiledFn<JsonStringifyFn>;
  toBSON: JitCompiledFn<ToBSONFn>; // NEW
  fromBSON: JitCompiledFn<FromBSONFn>; // NEW
}

// Add to SerializableJITFunctions interface
export interface SerializableJITFunctions {
  // ... existing functions
  toBSON: JitCompiledFnData; // NEW
  fromBSON: JitCompiledFnData; // NEW
}

// Add to JitFunctionsHashes interface
export interface JitFunctionsHashes {
  // ... existing functions
  toBSON: string; // NEW
  fromBSON: string; // NEW
}

// Add function type definitions
export type ToBSONFn = (value: any) => Uint8Array;
export type FromBSONFn = (bson: Uint8Array) => any;
```

### 2. Core Implementation Files

#### File: `packages/run-types/src/jitFns/toBSON.ts`

**Status: ⏳ TODO**

Main serialization compiler following `jsonStringify.ts` pattern:

```typescript
export function _compileToBSON(runType: BaseRunType, comp: JitCompiler, fnID = JitFunctions.toBSON.id): jitCode {
  const src = runType.src;
  const kind = src.kind;

  switch (kind) {
    case ReflectionKind.null:
      return `utl.writeBSONNull()`;
    case ReflectionKind.boolean:
      return `utl.writeBSONBoolean(${comp.vλl})`;
    case ReflectionKind.number:
      return generateNumberSerialization(comp.vλl);
    case ReflectionKind.string:
      return `utl.writeBSONString(${comp.vλl})`;
    case ReflectionKind.object:
      return compileObjectSerialization(runType, comp);
    // ... handle all ReflectionKind cases
  }
}
```

#### File: `packages/run-types/src/jitFns/fromBSON.ts`

**Status: ⏳ TODO**

Main deserialization compiler:

```typescript
export function _compileFromBSON(runType: BaseRunType, comp: JitCompiler, fnID = JitFunctions.fromBSON.id): jitCode {
  // Generate code to read BSON and validate against RunType
  return generateBSONReader(runType, comp);
}
```

#### File: `packages/run-types/src/jitFns/bsonUtils.ts`

**Status: ⏳ TODO**

Shared utilities and constants:

```typescript
// BSON type constants
export const BSON_TYPES = {
  DOUBLE: 0x01,
  STRING: 0x02,
  DOCUMENT: 0x03,
  ARRAY: 0x04,
  BINARY: 0x05,
  BOOLEAN: 0x08,
  NULL: 0x0a,
  INT32: 0x10,
  INT64: 0x12,
} as const;

// Buffer utilities
export class BSONWriter {
  writeInt32(value: number): void;
  writeDouble(value: number): void;
  writeString(value: string): void;
  writeBinary(data: Uint8Array): void;
  // ... other write methods
}

export class BSONReader {
  readInt32(): number;
  readDouble(): number;
  readString(): string;
  readBinary(): Uint8Array;
  // ... other read methods
}
```

### 3. JIT Utils Extensions

#### File: `packages/core/src/jitUtils.ts`

**Status: ⏳ TODO**

Add BSON utilities to `jitUtils` object:

```typescript
export const jitUtils: JITUtils = {
    // ... existing methods

    // BSON Writer methods
    writeBSONNull(): Uint8Array,
    writeBSONBoolean(value: boolean): Uint8Array,
    writeBSONInt32(value: number): Uint8Array,
    writeBSONDouble(value: number): Uint8Array,
    writeBSONString(value: string): Uint8Array,
    writeBSONBinary(data: Uint8Array): Uint8Array,
    writeBSONDocument(fields: Array<{name: string, type: number, data: Uint8Array}>): Uint8Array,

    // BSON Reader methods
    readBSONType(buffer: Uint8Array, offset: number): number,
    readBSONString(buffer: Uint8Array, offset: number): {value: string, nextOffset: number},
    readBSONInt32(buffer: Uint8Array, offset: number): {value: number, nextOffset: number},
    readBSONDouble(buffer: Uint8Array, offset: number): {value: number, nextOffset: number},
    // ... other read methods
};
```

### 4. Leveraging Existing JSON Functions

#### Reference Implementation Strategy

The BSON implementation should leverage existing JSON serialization logic as reference, particularly for complex TypeScript features:

**Key Reference Files:**

- `packages/run-types/src/jitFns/jsonStringify.ts` - Direct serialization patterns
- Individual RunType classes with `toJsonVal`/`fromJsonVal` methods - Type-specific transformations

#### TypeScript Feature Handling Examples

**Map and Set Types** (Reference: MapRunType, SetRunType):

```typescript
// Map serialization (reference from MapRunType.toJsonVal)
case ReflectionKind.map:
    return `utl.writeBSONArray(Array.from(${comp.vλl}).map(([k,v]) =>
        utl.writeBSONDocument([
            {name: "k", type: ${getBSONType('key')}, data: ${compileKey}},
            {name: "v", type: ${getBSONType('value')}, data: ${compileValue}}
        ])
    ))`;

// Set serialization (reference from SetRunType.toJsonVal)
case ReflectionKind.set:
    return `utl.writeBSONArray(Array.from(${comp.vλl}).map(item => ${compileItem}))`;
```

**Union Types** (Reference: UnionRunType):

```typescript
// Union serialization (reference from UnionRunType logic)
case ReflectionKind.union:
    return generateUnionBSONSerialization(runType as UnionRunType, comp);

function generateUnionBSONSerialization(unionType: UnionRunType, comp: JitCompiler): jitCode {
    // Reuse existing union type detection logic from jsonStringify
    const variants = unionType.getVariants();
    return variants.map(variant =>
        `if (${generateTypeCheck(variant, comp.vλl)}) {
            return ${_compileToBSON(variant, comp)};
        }`
    ).join('\n');
}
```

**Class Types** (Reference: ClassRunType):

```typescript
// Class serialization (reference from ClassRunType.toJsonVal)
case ReflectionKind.class:
    return `utl.writeBSONDocument([
        {name: "__className", type: BSON_TYPES.STRING, data: utl.writeBSONString("${runType.getClassName()}")},
        ${generateClassPropertiesBSON(runType as ClassRunType, comp)}
    ])`;
```

### 5. Type Detection and Optimization

#### Number Type Detection

```typescript
function generateNumberSerialization(valueExpr: string): jitCode {
  return `
        if (Number.isInteger(${valueExpr}) && ${valueExpr} >= -2147483648 && ${valueExpr} <= 2147483647) {
            utl.writeBSONInt32(${valueExpr})
        } else if (Number.isInteger(${valueExpr})) {
            utl.writeBSONInt64(${valueExpr})
        } else {
            utl.writeBSONDouble(${valueExpr})
        }
    `;
}
```

#### Object Serialization

```typescript
function compileObjectSerialization(runType: BaseRunType, comp: JitCompiler): jitCode {
  const properties = getObjectProperties(runType);
  const fieldCode = properties
    .map((prop) => `utl.writeBSONField("${prop.name}", ${getBSONType(prop.type)}, ${compilePropertyValue(prop, comp)})`)
    .join('\n');

  return `utl.writeBSONDocument([${fieldCode}])`;
}
```

### 5. Error Handling Strategy

#### Serialization Errors

```typescript
function generateTypeError(runType: BaseRunType, valueExpr: string): jitCode {
  return `throw new Error(\`Cannot serialize \${typeof ${valueExpr}} to BSON for type ${runType.getTypeName()}\`)`;
}
```

#### Deserialization Validation

```typescript
function generateTypeValidation(expectedType: string, actualType: string): jitCode {
  return `
        if (${actualType} !== ${expectedType}) {
            throw new Error(\`Expected BSON type ${expectedType}, got \${${actualType}}\`);
        }
    `;
}
```

### 6. Performance Optimizations

#### Buffer Pre-sizing

```typescript
function calculateApproximateSize(runType: BaseRunType): jitCode {
  // Generate code to estimate BSON size before allocation
  return `
        let estimatedSize = 4; // document length
        ${generateSizeCalculation(runType)}
        estimatedSize += 1; // document terminator
    `;
}
```

#### Inline Property Access

```typescript
function generateInlinePropertyAccess(properties: PropertyInfo[]): jitCode {
  return properties.map((prop) => `const ${prop.varName} = ${comp.vλl}.${prop.name};`).join('\n');
}
```

### 7. Testing Strategy

#### Unit Tests

- Test each BSON type serialization/deserialization
- Test complex nested objects and arrays
- Test edge cases (null, undefined, empty objects)
- Test performance with large objects

#### Integration Tests

- Test with existing RunType validation
- Test with union types and optional properties
- Test error handling and edge cases
- Test compatibility with MongoDB BSON

### 8. Progressive Implementation Strategy

#### Start with Atomic Types First

The implementation should follow a progressive approach, starting with the simplest atomic types and gradually building up to complex TypeScript features:

#### Phase 1: Atomic Types Foundation

**Target ReflectionKind cases:**

```typescript
// Start with these basic cases in toBSON.ts and fromBSON.ts
case ReflectionKind.null:
case ReflectionKind.boolean:
case ReflectionKind.number:
case ReflectionKind.string:
case ReflectionKind.bigint:
```

**Implementation order:**

1. **Null and Boolean** - Simplest types, no variable data
2. **Numbers** - Integer vs float detection logic
3. **Strings** - Variable length with UTF-8 encoding
4. **BigInt** - 64-bit integer handling

**Test file structure:**

```typescript
// bson.spec.ts - Start with atomic types
describe('BSON Atomic Types', () => {
  describe('null and undefined', () => {
    it('should serialize null to BSON null type', () => {});
    it('should deserialize BSON null to null', () => {});
  });

  describe('boolean', () => {
    it('should serialize true/false to BSON boolean', () => {});
    it('should deserialize BSON boolean correctly', () => {});
  });

  describe('numbers', () => {
    it('should serialize integers as BSON int32 when in range', () => {});
    it('should serialize large integers as BSON int64', () => {});
    it('should serialize floats as BSON double', () => {});
  });

  describe('strings', () => {
    it('should serialize strings with UTF-8 encoding', () => {});
    it('should handle empty strings', () => {});
    it('should handle unicode characters', () => {});
  });
});
```

#### Phase 2: Simple Collections

**Target ReflectionKind cases:**

```typescript
case ReflectionKind.array:
case ReflectionKind.object: // Simple objects without complex features
case ReflectionKind.literal:
```

**Build upon atomic foundation:**

- Arrays of atomic types
- Simple objects with atomic properties
- Literal types (string/number/boolean literals)

#### Phase 3: Advanced Collections

**Target ReflectionKind cases:**

```typescript
case ReflectionKind.tuple:
case ReflectionKind.map:
case ReflectionKind.set:
case ReflectionKind.class:
```

**Leverage existing JSON logic:**

- Reference `MapRunType.toJsonVal()` for Map handling
- Reference `SetRunType.toJsonVal()` for Set handling
- Reference `ClassRunType.toJsonVal()` for Class serialization

#### Phase 4: Complex TypeScript Features

**Target ReflectionKind cases:**

```typescript
case ReflectionKind.union:
case ReflectionKind.intersection:
case ReflectionKind.function:
case ReflectionKind.promise:
```

**Advanced features:**

- Union type discrimination
- Optional properties
- Branded types
- Function serialization (via toCode)

#### Phase 5: Optimization & Polish

- Performance optimizations
- Buffer pooling
- Size pre-calculation
- Comprehensive error handling

### 9. Implementation Timeline

#### Phase 1: Atomic Types Foundation

- Implement `bsonUtils.ts` with basic buffer utilities
- Implement atomic types in `toBSON.ts` and `fromBSON.ts`
- Create basic test suite for atomic types
- Add BSON utilities to `jitUtils.ts`

#### Phase 2: Simple Collections

- Arrays and simple objects
- Literal types
- Nested object serialization
- Expand test coverage

#### Phase 3: Advanced Collections

- Maps, Sets, Classes, Tuples
- Reference existing JSON implementations
- Complex object handling

#### Phase 4: Complex TypeScript Features

- Union types and intersections
- Optional properties and branded types
- Function serialization integration

#### Phase 5: Optimization & Polish

- Performance benchmarking
- Buffer pooling and size optimization
- Error handling improvements
- Documentation and examples

## File Structure

```
packages/run-types/src/jitFns/
├── BSON_SPECIFICATION.md      ✅ COMPLETED
├── BSON_IMPLEMENTATION.md     ✅ COMPLETED
├── toBSON.ts                  ⏳ TODO
├── fromBSON.ts                ⏳ TODO
├── bsonUtils.ts               ⏳ TODO
└── bson.spec.ts               ⏳ TODO
```

## Next Steps

1. **Update core types** in `packages/core/src/types.ts`
2. **Implement bsonUtils.ts** with buffer utilities
3. **Create toBSON.ts** following jsonStringify pattern
4. **Create fromBSON.ts** for deserialization
5. **Add BSON utilities** to jitUtils
6. **Write comprehensive tests**
7. **Performance benchmarking** against JSON
