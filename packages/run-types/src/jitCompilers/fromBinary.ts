/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {BaseRunType} from '../lib/baseRunTypes';
import type {PropertyRunType} from '../runType/member/property';
import type {MapRunType} from '../runType/native/map';
import type {SetRunType} from '../runType/native/set';
import type {InterfaceRunType} from '../runType/collection/interface';
import type {TupleRunType} from '../runType/collection/tuple';
import type {UnionRunType} from '../runType/collection/union';
import type {EnumRunType} from '../runType/atomic/enum';
import type {ParameterRunType} from '../runType/member/param';
import type {RestParamsRunType} from '../runType/member/restParams';
import {ReflectionSubKind} from '../constants.kind';
import {NonSerializableRunType} from '../runType/native/nonSerializable';
import {IndexSignatureRunType} from '../runType/member/indexProperty';
import {ClassRunType} from '../runType/collection/class';
// JitFunctions is not used in this file

// Binary format type markers - must match the ones in toBinary.ts
const TYPE_MARKERS = {
    NULL: 0,
    UNDEFINED: 1,
    BOOLEAN_FALSE: 2,
    BOOLEAN_TRUE: 3,
    NUMBER: 4,
    BIGINT: 5,
    STRING: 6,
    DATE: 7,
    ARRAY: 8,
    OBJECT: 9,
    MAP: 10,
    SET: 11,
    REGEXP: 12,
    ENUM: 13,
    LITERAL: 14,
    SYMBOL: 15,
};

/**
 * Options for binary deserialization
 */
export interface BinaryDeserializationOptions {
    // Add any options needed for binary deserialization
}

/**
 * Context for binary deserialization operation
 */
export interface BinaryDeserializationContext extends BinaryDeserializationOptions {
    // Track objects to handle circular references
    objectRefs: Map<number, any>;
    refCounter: number;
    stack: BaseRunType[];
    maxRecursion: number;
    // Current position in the binary data
    offset: number;
}

/**
 * Initialize binary deserialization context
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function initBinaryContext(_options?: Partial<BinaryDeserializationOptions>): BinaryDeserializationContext {
    return {
        objectRefs: new Map(),
        refCounter: 0,
        stack: [],
        maxRecursion: 10, // Default max recursion depth
        offset: 0,
    };
}

/**
 * Main function to deserialize binary data to JavaScript objects
 * @param binary The binary data to deserialize
 * @param runType The RunType describing the expected type
 * @param options Deserialization options
 * @returns The deserialized JavaScript value
 */
export function fromBinary(binary: Uint8Array, runType: BaseRunType, options?: Partial<BinaryDeserializationOptions>): any {
    const ctx = initBinaryContext(options);
    ctx.stack.push(runType);
    const result = _fromBinary(binary, runType, ctx);
    ctx.stack.pop();
    return result;
}

/**
 * Read a type marker from the binary data
 */
function readTypeMarker(binary: Uint8Array, ctx: BinaryDeserializationContext): number {
    const marker = binary[ctx.offset];
    ctx.offset += 1;
    return marker;
}

/**
 * Read a uint32 from the binary data
 */
function readUint32(binary: Uint8Array, ctx: BinaryDeserializationContext): number {
    const view = new DataView(binary.buffer, binary.byteOffset + ctx.offset, 4);
    const value = view.getUint32(0, true);
    ctx.offset += 4;
    return value;
}

/**
 * Read a float64 from the binary data
 */
function readFloat64(binary: Uint8Array, ctx: BinaryDeserializationContext): number {
    const view = new DataView(binary.buffer, binary.byteOffset + ctx.offset, 8);
    const value = view.getFloat64(0, true);
    ctx.offset += 8;
    return value;
}

/**
 * Read a string from the binary data
 */
function readString(binary: Uint8Array, ctx: BinaryDeserializationContext, skipMarker: boolean = false): string {
    if (!skipMarker) {
        const marker = readTypeMarker(binary, ctx);
        if (marker !== TYPE_MARKERS.STRING) {
            throw new Error(`Expected string marker (${TYPE_MARKERS.STRING}), got ${marker}`);
        }
    }

    // Read string length
    const length = readUint32(binary, ctx);

    // Read string data
    const decoder = new TextDecoder();
    const stringBytes = binary.subarray(ctx.offset, ctx.offset + length);
    ctx.offset += length;

    return decoder.decode(stringBytes);
}

/**
 * Deserialize a null value
 */
function deserializeNull(binary: Uint8Array, ctx: BinaryDeserializationContext): null {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.NULL) {
        throw new Error(`Expected null marker (${TYPE_MARKERS.NULL}), got ${marker}`);
    }
    return null;
}

/**
 * Deserialize an undefined value
 */
function deserializeUndefined(binary: Uint8Array, ctx: BinaryDeserializationContext): undefined {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.UNDEFINED) {
        throw new Error(`Expected undefined marker (${TYPE_MARKERS.UNDEFINED}), got ${marker}`);
    }
    return undefined;
}

/**
 * Deserialize a boolean value
 */
function deserializeBoolean(binary: Uint8Array, ctx: BinaryDeserializationContext): boolean {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.BOOLEAN_TRUE && marker !== TYPE_MARKERS.BOOLEAN_FALSE) {
        throw new Error(`Expected boolean marker (${TYPE_MARKERS.BOOLEAN_TRUE} or ${TYPE_MARKERS.BOOLEAN_FALSE}), got ${marker}`);
    }
    return marker === TYPE_MARKERS.BOOLEAN_TRUE;
}

/**
 * Deserialize a number value
 */
function deserializeNumber(binary: Uint8Array, ctx: BinaryDeserializationContext): number {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.NUMBER) {
        throw new Error(`Expected number marker (${TYPE_MARKERS.NUMBER}), got ${marker}`);
    }
    return readFloat64(binary, ctx);
}

/**
 * Deserialize a bigint value
 */
function deserializeBigInt(binary: Uint8Array, ctx: BinaryDeserializationContext): bigint {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.BIGINT) {
        throw new Error(`Expected bigint marker (${TYPE_MARKERS.BIGINT}), got ${marker}`);
    }

    // Read the bigint as a string and convert
    const bigintStr = readString(binary, ctx, true);
    return BigInt(bigintStr);
}

/**
 * Deserialize a symbol value
 */
function deserializeSymbol(binary: Uint8Array, ctx: BinaryDeserializationContext): symbol {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.SYMBOL) {
        throw new Error(`Expected symbol marker (${TYPE_MARKERS.SYMBOL}), got ${marker}`);
    }

    // Read the symbol description
    const description = readString(binary, ctx, true);
    return Symbol(description);
}

/**
 * Deserialize a date value
 */
function deserializeDate(binary: Uint8Array, ctx: BinaryDeserializationContext): Date {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.DATE) {
        throw new Error(`Expected date marker (${TYPE_MARKERS.DATE}), got ${marker}`);
    }

    // Read the timestamp
    const timestamp = readFloat64(binary, ctx);
    return new Date(timestamp);
}

/**
 * Deserialize a regexp value
 */
function deserializeRegExp(binary: Uint8Array, ctx: BinaryDeserializationContext): RegExp {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.REGEXP) {
        throw new Error(`Expected regexp marker (${TYPE_MARKERS.REGEXP}), got ${marker}`);
    }

    // Read pattern and flags
    const pattern = readString(binary, ctx, true);
    const flags = readString(binary, ctx, true);

    return new RegExp(pattern, flags);
}

/**
 * Deserialize an array value
 */
function deserializeArray(binary: Uint8Array, ctx: BinaryDeserializationContext, elementType?: BaseRunType): any[] {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.ARRAY) {
        throw new Error(`Expected array marker (${TYPE_MARKERS.ARRAY}), got ${marker}`);
    }

    // Read array length
    const length = readUint32(binary, ctx);

    // Create array and register it for circular references
    const array: any[] = new Array(length);
    ctx.objectRefs.set(ctx.refCounter++, array);

    // Deserialize each array element
    if (elementType) {
        for (let i = 0; i < length; i++) {
            ctx.stack.push(elementType);
            array[i] = _fromBinary(binary, elementType, ctx);
            ctx.stack.pop();
        }
    } else {
        for (let i = 0; i < length; i++) {
            array[i] = deserializeValue(binary, ctx);
        }
    }

    return array;
}

/**
 * Deserialize a map value
 */
function deserializeMap(
    binary: Uint8Array,
    ctx: BinaryDeserializationContext,
    keyType?: BaseRunType,
    valueType?: BaseRunType
): Map<any, any> {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.MAP) {
        throw new Error(`Expected map marker (${TYPE_MARKERS.MAP}), got ${marker}`);
    }

    // Read map size
    const size = readUint32(binary, ctx);

    // Create map and register it for circular references
    const map = new Map();
    ctx.objectRefs.set(ctx.refCounter++, map);

    // Deserialize each key-value pair
    for (let i = 0; i < size; i++) {
        let key: any, value: any;

        if (keyType && valueType) {
            ctx.stack.push(keyType);
            key = _fromBinary(binary, keyType, ctx);
            ctx.stack.pop();

            ctx.stack.push(valueType);
            value = _fromBinary(binary, valueType, ctx);
            ctx.stack.pop();
        } else {
            key = deserializeValue(binary, ctx);
            value = deserializeValue(binary, ctx);
        }

        map.set(key, value);
    }

    return map;
}

/**
 * Deserialize a set value
 */
function deserializeSet(binary: Uint8Array, ctx: BinaryDeserializationContext, itemType?: BaseRunType): Set<any> {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.SET) {
        throw new Error(`Expected set marker (${TYPE_MARKERS.SET}), got ${marker}`);
    }

    // Read set size
    const size = readUint32(binary, ctx);

    // Create set and register it for circular references
    const set = new Set();
    ctx.objectRefs.set(ctx.refCounter++, set);

    // Deserialize each set element
    if (itemType) {
        for (let i = 0; i < size; i++) {
            ctx.stack.push(itemType);
            const item = _fromBinary(binary, itemType, ctx);
            ctx.stack.pop();
            set.add(item);
        }
    } else {
        for (let i = 0; i < size; i++) {
            const item = deserializeValue(binary, ctx);
            set.add(item);
        }
    }

    return set;
}

/**
 * Deserialize an object value
 */
function deserializeObject(
    binary: Uint8Array,
    ctx: BinaryDeserializationContext,
    properties?: PropertyRunType[]
): Record<string, any> {
    const marker = readTypeMarker(binary, ctx);
    if (marker !== TYPE_MARKERS.OBJECT) {
        throw new Error(`Expected object marker (${TYPE_MARKERS.OBJECT}), got ${marker}`);
    }

    // Create object and register it for circular references
    const obj: Record<string, any> = {};
    ctx.objectRefs.set(ctx.refCounter++, obj);

    // Read number of properties
    const count = readUint32(binary, ctx);

    if (properties) {
        // Deserialize with type information
        for (let i = 0; i < count; i++) {
            // Read property name
            const propName = readString(binary, ctx, true);

            // Find the property type
            const propType = properties.find((p) => p.getChildVarName() === propName);

            if (propType) {
                const memberType = propType.getMemberType();
                ctx.stack.push(memberType);
                obj[propName] = _fromBinary(binary, memberType, ctx);
                ctx.stack.pop();
            } else {
                // If we don't have type information, deserialize generically
                obj[propName] = deserializeValue(binary, ctx);
            }
        }
    } else {
        // Generic object deserialization
        for (let i = 0; i < count; i++) {
            // Read property name
            const propName = readString(binary, ctx, true);

            // Read property value
            obj[propName] = deserializeValue(binary, ctx);
        }
    }

    return obj;
}

/**
 * Generic value deserialization function
 */
function deserializeValue(binary: Uint8Array, ctx: BinaryDeserializationContext): any {
    // Peek at the type marker without advancing the offset
    const marker = binary[ctx.offset];

    switch (marker) {
        case TYPE_MARKERS.NULL:
            return deserializeNull(binary, ctx);

        case TYPE_MARKERS.UNDEFINED:
            return deserializeUndefined(binary, ctx);

        case TYPE_MARKERS.BOOLEAN_TRUE:
        case TYPE_MARKERS.BOOLEAN_FALSE:
            return deserializeBoolean(binary, ctx);

        case TYPE_MARKERS.NUMBER:
            return deserializeNumber(binary, ctx);

        case TYPE_MARKERS.BIGINT:
            return deserializeBigInt(binary, ctx);

        case TYPE_MARKERS.STRING:
            return readString(binary, ctx);

        case TYPE_MARKERS.DATE:
            return deserializeDate(binary, ctx);

        case TYPE_MARKERS.ARRAY:
            return deserializeArray(binary, ctx);

        case TYPE_MARKERS.OBJECT:
            return deserializeObject(binary, ctx);

        case TYPE_MARKERS.MAP:
            return deserializeMap(binary, ctx);

        case TYPE_MARKERS.SET:
            return deserializeSet(binary, ctx);

        case TYPE_MARKERS.REGEXP:
            return deserializeRegExp(binary, ctx);

        case TYPE_MARKERS.SYMBOL:
            return deserializeSymbol(binary, ctx);

        case TYPE_MARKERS.ENUM:
            // We can't deserialize an enum without type information
            throw new Error('Cannot deserialize enum without type information');

        case TYPE_MARKERS.LITERAL:
            // We can't deserialize a literal without type information
            throw new Error('Cannot deserialize literal without type information');

        default:
            throw new Error(`Unknown type marker: ${marker}`);
    }
}

/**
 * Centralized binary deserialization function with a giant switch statement that handles all node types.
 * This function is similar to _mock in mockType.ts but for binary deserialization.
 */
function _fromBinary(binary: Uint8Array, runType: BaseRunType, ctx: BinaryDeserializationContext): any {
    // Handle circular references
    const recursionLevel = ctx.stack.filter((rt) => rt === runType).length;
    if (recursionLevel > ctx.maxRecursion) {
        throw new Error('Maximum recursion depth exceeded during deserialization');
    }

    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        case ReflectionKind.never:
            throw new Error('Cannot deserialize never type.');

        case ReflectionKind.any:
        case ReflectionKind.unknown:
            return deserializeValue(binary, ctx);

        // Atomic types
        case ReflectionKind.string:
            return readString(binary, ctx);

        case ReflectionKind.number:
            return deserializeNumber(binary, ctx);

        case ReflectionKind.boolean:
            return deserializeBoolean(binary, ctx);

        case ReflectionKind.bigint:
            return deserializeBigInt(binary, ctx);

        case ReflectionKind.null:
            return deserializeNull(binary, ctx);

        case ReflectionKind.undefined:
        case ReflectionKind.void:
            return deserializeUndefined(binary, ctx);

        case ReflectionKind.regexp:
            return deserializeRegExp(binary, ctx);

        case ReflectionKind.symbol:
            return deserializeSymbol(binary, ctx);

        case ReflectionKind.literal: {
            // For literals, we deserialize the value and verify it matches the expected literal
            const marker = readTypeMarker(binary, ctx);
            if (marker !== TYPE_MARKERS.LITERAL) {
                throw new Error(`Expected literal marker (${TYPE_MARKERS.LITERAL}), got ${marker}`);
            }

            // Deserialize the literal value
            const value = deserializeValue(binary, ctx);

            // Verify it matches the expected literal
            if (value !== src.literal) {
                throw new Error(`Expected literal value ${String(src.literal)}, got ${String(value)}`);
            }

            return value;
        }

        case ReflectionKind.object:
            return deserializeValue(binary, ctx);

        case ReflectionKind.enum: {
            const marker = readTypeMarker(binary, ctx);
            if (marker !== TYPE_MARKERS.ENUM) {
                throw new Error(`Expected enum marker (${TYPE_MARKERS.ENUM}), got ${marker}`);
            }

            // Read the enum index
            const index = readUint32(binary, ctx);

            // Get the enum value
            const rt = runType as EnumRunType;
            if (index < 0 || index >= rt.src.values.length) {
                throw new Error(`Invalid enum index: ${index}`);
            }

            return rt.src.values[index];
        }

        case ReflectionKind.enumMember:
            throw new Error('Deserializing enum member directly is not supported.');

        // Collection types
        case ReflectionKind.array: {
            const memberType = (runType as any).getMemberType();
            return deserializeArray(binary, ctx, memberType);
        }

        case ReflectionKind.tuple: {
            const rt = runType as TupleRunType;
            const childTypes = rt.getChildRunTypes();

            const marker = readTypeMarker(binary, ctx);
            if (marker !== TYPE_MARKERS.ARRAY) {
                throw new Error(`Expected array marker (${TYPE_MARKERS.ARRAY}), got ${marker}`);
            }

            // Read array length
            const length = readUint32(binary, ctx);

            // Create array and register it for circular references
            const array: any[] = [];
            ctx.objectRefs.set(ctx.refCounter++, array);

            // Handle rest parameter if present
            if (rt.hasRestParameter()) {
                const nonRestTypes = childTypes.slice(0, -1);
                const restType = childTypes[childTypes.length - 1];

                // Deserialize non-rest elements
                for (let i = 0; i < nonRestTypes.length; i++) {
                    ctx.stack.push(nonRestTypes[i]);
                    array[i] = _fromBinary(binary, nonRestTypes[i], ctx);
                    ctx.stack.pop();
                }

                // Deserialize rest elements
                const restMemberType = (restType as unknown as RestParamsRunType).getMemberType();
                for (let i = nonRestTypes.length; i < length; i++) {
                    ctx.stack.push(restMemberType);
                    array[i] = _fromBinary(binary, restMemberType, ctx);
                    ctx.stack.pop();
                }
            } else {
                // Deserialize each tuple element
                for (let i = 0; i < length; i++) {
                    if (i < childTypes.length) {
                        ctx.stack.push(childTypes[i]);
                        array[i] = _fromBinary(binary, childTypes[i], ctx);
                        ctx.stack.pop();
                    } else {
                        // If we have more elements than types, deserialize generically
                        array[i] = deserializeValue(binary, ctx);
                    }
                }
            }

            return array;
        }

        case ReflectionKind.intersection:
        case ReflectionKind.objectLiteral: {
            if (runType instanceof NonSerializableRunType) {
                throw new Error(`Deserialization is disabled for Non Serializable types.`);
            } else {
                const rt = runType as InterfaceRunType;
                if (rt.isCallable()) {
                    throw new Error('Cannot deserialize function types.');
                }

                const properties = rt.getChildRunTypes() as PropertyRunType[];
                return deserializeObject(binary, ctx, properties);
            }
        }

        case ReflectionKind.class:
            return _deserializeClass(binary, runType, ctx);

        case ReflectionKind.union: {
            // Read the union index
            const index = readUint32(binary, ctx);

            const rt = runType as UnionRunType;
            const childTypes = rt.getChildRunTypes();

            if (index < 0 || index >= childTypes.length) {
                throw new Error(`Invalid union index: ${index}`);
            }

            // Deserialize the value using the specified type
            ctx.stack.push(childTypes[index]);
            const value = _fromBinary(binary, childTypes[index], ctx);
            ctx.stack.pop();

            return value;
        }

        case ReflectionKind.function:
        case ReflectionKind.callSignature:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
            throw new Error('Cannot deserialize function types.');

        case ReflectionKind.promise:
            throw new Error('Cannot deserialize Promise directly.');

        // Member types
        case ReflectionKind.tupleMember:
        case ReflectionKind.parameter: {
            const rt = runType as ParameterRunType;
            if (!rt.getJitChild()) {
                return deserializeUndefined(binary, ctx);
            }

            const memberType = rt.getMemberType();
            ctx.stack.push(memberType);
            const value = _fromBinary(binary, memberType, ctx);
            ctx.stack.pop();
            return value;
        }

        case ReflectionKind.propertySignature:
        case ReflectionKind.property: {
            const rt = runType as PropertyRunType;
            const memberType = rt.getMemberType();
            ctx.stack.push(memberType);
            const value = _fromBinary(binary, memberType, ctx);
            ctx.stack.pop();
            return value;
        }

        case ReflectionKind.rest: {
            const rt = runType as RestParamsRunType;
            const memberType = rt.getMemberType();
            return deserializeArray(binary, ctx, memberType);
        }

        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const indexKind = rt.src.index.kind;
            const memberType = rt.getMemberType();

            // Read the number of entries
            const count = readUint32(binary, ctx);

            // Create object and register it for circular references
            const obj: Record<string | number | symbol, any> = {};
            ctx.objectRefs.set(ctx.refCounter++, obj);

            // Deserialize each entry
            for (let i = 0; i < count; i++) {
                // Deserialize the key based on its type
                let key: string | number | symbol;
                switch (indexKind) {
                    case ReflectionKind.number:
                        key = deserializeNumber(binary, ctx);
                        break;
                    case ReflectionKind.string:
                        key = readString(binary, ctx);
                        break;
                    case ReflectionKind.symbol:
                        key = deserializeSymbol(binary, ctx);
                        break;
                    default:
                        throw new Error(`Unsupported index signature type: ${indexKind}`);
                }

                // Deserialize the value
                ctx.stack.push(memberType);
                obj[key] = _fromBinary(binary, memberType, ctx);
                ctx.stack.pop();
            }

            return obj;
        }

        case ReflectionKind.infer:
        case ReflectionKind.templateLiteral:
        case ReflectionKind.typeParameter:
        default:
            throw new Error(`Unsupported RunType for deserialization: ${runType.getTypeName()}`);
    }
}

/**
 * Deserialize class instances based on their subKind
 */
function _deserializeClass(binary: Uint8Array, runType: BaseRunType, ctx: BinaryDeserializationContext): any {
    switch (runType.src.subKind) {
        case ReflectionSubKind.date:
            return deserializeDate(binary, ctx);

        case ReflectionSubKind.map: {
            const mapRunType = runType as unknown as MapRunType;
            return deserializeMap(binary, ctx, mapRunType.keyRT, mapRunType.valueRT);
        }

        case ReflectionSubKind.set: {
            const setRunType = runType as unknown as SetRunType;
            return deserializeSet(binary, ctx, setRunType.keyRT);
        }

        case ReflectionSubKind.nonSerializable:
            throw new Error(`Deserialization is disabled for Non Serializable types.`);

        default: {
            if (!(runType instanceof ClassRunType)) {
                throw new Error(`Unsupported RunType for deserialization: ${runType.getTypeName()}`);
            }

            const rt = runType as ClassRunType;
            const isSerializable = rt.isSerializableClass();

            if (!isSerializable) {
                throw new Error(
                    `Class ${rt.getClassName()} cannot be deserialized. Only classes with an empty constructor can be deserialized.`
                );
            }

            // Deserialize as an object first
            const properties = rt.getJitChildren() as PropertyRunType[];
            const obj = deserializeObject(binary, ctx, properties);

            // Create a new instance of the class
            const instance = new rt.src.classType();

            // Copy properties to the instance
            for (const key in obj) {
                instance[key] = obj[key];
            }

            return instance;
        }
    }
}
