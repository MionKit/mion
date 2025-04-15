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
import {JitFunctions} from '../constants';

// Binary format type markers
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
 * Options for binary serialization
 */
export interface BinarySerializationOptions {
    // Add any options needed for binary serialization
    includeTypeInfo?: boolean;
}

/**
 * Context for binary serialization operation
 */
export interface BinarySerializationContext extends BinarySerializationOptions {
    // Track objects to handle circular references
    objectRefs: Map<any, number>;
    refCounter: number;
    stack: BaseRunType[];
    maxRecursion: number;
}

/**
 * Initialize binary serialization context
 */
function initBinaryContext(options?: Partial<BinarySerializationOptions>): BinarySerializationContext {
    return {
        includeTypeInfo: options?.includeTypeInfo ?? false,
        objectRefs: new Map(),
        refCounter: 0,
        stack: [],
        maxRecursion: 10, // Default max recursion depth
    };
}

/**
 * Main function to serialize JavaScript data to binary format
 * @param value The value to serialize
 * @param runType The RunType describing the value's type
 * @param options Serialization options
 * @returns Uint8Array containing the binary representation
 */
export function toBinary(value: any, runType: BaseRunType, options?: Partial<BinarySerializationOptions>): Uint8Array {
    const ctx = initBinaryContext(options);
    const chunks: Uint8Array[] = [];

    ctx.stack.push(runType);
    _toBinary(value, runType, chunks, ctx);
    ctx.stack.pop();

    // Combine all chunks into a single Uint8Array
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return result;
}

// Collection type serialization functions

function serializeArray(value: any[], chunks: Uint8Array[], ctx: BinarySerializationContext, elementType?: BaseRunType): void {
    const marker = new Uint8Array([TYPE_MARKERS.ARRAY]);
    chunks.push(marker);

    // Add array length as uint32
    const lengthBuffer = new ArrayBuffer(4);
    const lengthView = new DataView(lengthBuffer);
    lengthView.setUint32(0, value.length, true);
    chunks.push(new Uint8Array(lengthBuffer));

    // Serialize each array element
    if (elementType) {
        // If we have type information, use it
        for (const item of value) {
            ctx.stack.push(elementType);
            _toBinary(item, elementType, chunks, ctx);
            ctx.stack.pop();
        }
    } else {
        // Otherwise, serialize generically
        for (const item of value) {
            serializeValue(item, chunks, ctx);
        }
    }
}

function serializeMap(
    value: Map<any, any>,
    chunks: Uint8Array[],
    ctx: BinarySerializationContext,
    keyType?: BaseRunType,
    valueType?: BaseRunType
): void {
    const marker = new Uint8Array([TYPE_MARKERS.MAP]);
    chunks.push(marker);

    // Add map size as uint32
    const sizeBuffer = new ArrayBuffer(4);
    const sizeView = new DataView(sizeBuffer);
    sizeView.setUint32(0, value.size, true);
    chunks.push(new Uint8Array(sizeBuffer));

    // Serialize each key-value pair
    for (const [key, val] of value.entries()) {
        if (keyType && valueType) {
            ctx.stack.push(keyType);
            _toBinary(key, keyType, chunks, ctx);
            ctx.stack.pop();

            ctx.stack.push(valueType);
            _toBinary(val, valueType, chunks, ctx);
            ctx.stack.pop();
        } else {
            serializeValue(key, chunks, ctx);
            serializeValue(val, chunks, ctx);
        }
    }
}

function serializeSet(value: Set<any>, chunks: Uint8Array[], ctx: BinarySerializationContext, itemType?: BaseRunType): void {
    const marker = new Uint8Array([TYPE_MARKERS.SET]);
    chunks.push(marker);

    // Add set size as uint32
    const sizeBuffer = new ArrayBuffer(4);
    const sizeView = new DataView(sizeBuffer);
    sizeView.setUint32(0, value.size, true);
    chunks.push(new Uint8Array(sizeBuffer));

    // Serialize each set element
    if (itemType) {
        for (const item of value) {
            ctx.stack.push(itemType);
            _toBinary(item, itemType, chunks, ctx);
            ctx.stack.pop();
        }
    } else {
        for (const item of value) {
            serializeValue(item, chunks, ctx);
        }
    }
}

function serializeObject(
    value: Record<string, any>,
    chunks: Uint8Array[],
    ctx: BinarySerializationContext,
    properties?: PropertyRunType[]
): void {
    const marker = new Uint8Array([TYPE_MARKERS.OBJECT]);
    chunks.push(marker);

    if (properties) {
        // Serialize with type information
        // Add number of properties
        const countBuffer = new ArrayBuffer(4);
        const countView = new DataView(countBuffer);
        countView.setUint32(0, properties.length, true);
        chunks.push(new Uint8Array(countBuffer));

        // Serialize each property
        for (const prop of properties) {
            const propName = prop.getChildVarName();

            // Serialize property name
            serializeString(String(propName), chunks, false);

            // Serialize property value
            if (value[propName] !== undefined) {
                const memberType = prop.getMemberType();
                ctx.stack.push(memberType);
                _toBinary(value[propName], memberType, chunks, ctx);
                ctx.stack.pop();
            } else {
                // Property is undefined
                serializeUndefined(chunks);
            }
        }
    } else {
        // Generic object serialization
        const keys = Object.keys(value);

        // Add number of properties
        const countBuffer = new ArrayBuffer(4);
        const countView = new DataView(countBuffer);
        countView.setUint32(0, keys.length, true);
        chunks.push(new Uint8Array(countBuffer));

        // Serialize each property
        for (const key of keys) {
            serializeString(key, chunks, false); // Serialize property name
            serializeValue(value[key], chunks, ctx); // Serialize property value
        }
    }
}

// Generic value serialization function
function serializeValue(value: any, chunks: Uint8Array[], ctx: BinarySerializationContext): void {
    // Handle circular references for objects
    if (typeof value === 'object' && value !== null) {
        if (ctx.objectRefs.has(value)) {
            // For circular references, we'll serialize a null value
            serializeNull(chunks);
            return;
        }
        ctx.objectRefs.set(value, ctx.refCounter++);
    }

    if (value === null) {
        serializeNull(chunks);
        return;
    }

    if (value === undefined) {
        serializeUndefined(chunks);
        return;
    }

    const type = typeof value;

    switch (type) {
        case 'boolean':
            serializeBoolean(value, chunks);
            break;

        case 'number':
            serializeNumber(value, chunks);
            break;

        case 'bigint':
            serializeBigInt(value, chunks);
            break;

        case 'string':
            serializeString(value, chunks);
            break;

        case 'symbol':
            serializeSymbol(value, chunks);
            break;

        case 'object':
            if (Array.isArray(value)) {
                serializeArray(value, chunks, ctx);
            } else if (value instanceof Date) {
                serializeDate(value, chunks);
            } else if (value instanceof Map) {
                serializeMap(value, chunks, ctx);
            } else if (value instanceof Set) {
                serializeSet(value, chunks, ctx);
            } else if (value instanceof RegExp) {
                serializeRegExp(value, chunks);
            } else {
                serializeObject(value, chunks, ctx);
            }
            break;

        default:
            throw new Error(`Unsupported type for binary serialization: ${type}`);
    }
}

function _toBinary(value: any, runType: BaseRunType, chunks: Uint8Array[], ctx: BinarySerializationContext): void {
    // Handle circular references
    const recursionLevel = ctx.stack.filter((rt) => rt === runType).length;
    if (recursionLevel > ctx.maxRecursion) {
        // For circular references, we'll serialize a null value
        serializeNull(chunks);
        return;
    }

    const src = runType.src;
    const kind = src.kind;

    switch (kind) {
        case ReflectionKind.never:
            throw new Error('Cannot serialize never type.');

        case ReflectionKind.any:
        case ReflectionKind.unknown:
            serializeValue(value, chunks, ctx);
            break;

        // Atomic types
        case ReflectionKind.string:
            serializeString(value, chunks);
            break;

        case ReflectionKind.number:
            serializeNumber(value, chunks);
            break;

        case ReflectionKind.boolean:
            serializeBoolean(value, chunks);
            break;

        case ReflectionKind.bigint:
            serializeBigInt(value, chunks);
            break;

        case ReflectionKind.null:
            serializeNull(chunks);
            break;

        case ReflectionKind.undefined:
        case ReflectionKind.void:
            serializeUndefined(chunks);
            break;

        case ReflectionKind.regexp:
            serializeRegExp(value, chunks);
            break;

        case ReflectionKind.symbol:
            serializeSymbol(value, chunks);
            break;

        case ReflectionKind.literal:
            // For literals, we serialize the literal value directly
            serializeValue(src.literal, chunks, ctx);
            break;

        case ReflectionKind.object:
            serializeValue(value, chunks, ctx);
            break;

        case ReflectionKind.enum: {
            const rt = runType as EnumRunType;
            const marker = new Uint8Array([TYPE_MARKERS.ENUM]);
            chunks.push(marker);

            // Find the index of the enum value
            const index = rt.src.values.indexOf(value);

            // Serialize the index
            const indexBuffer = new ArrayBuffer(4);
            const indexView = new DataView(indexBuffer);
            indexView.setUint32(0, index, true);
            chunks.push(new Uint8Array(indexBuffer));
            break;
        }

        case ReflectionKind.enumMember:
            throw new Error('Serializing enum member directly is not supported.');

        // Collection types
        case ReflectionKind.array: {
            if (!Array.isArray(value)) {
                throw new Error('Expected an array for array type.');
            }

            const memberType = (runType as any).getMemberType();
            serializeArray(value, chunks, ctx, memberType);
            break;
        }

        case ReflectionKind.tuple: {
            const rt = runType as TupleRunType;
            const childTypes = rt.getChildRunTypes();

            const marker = new Uint8Array([TYPE_MARKERS.ARRAY]); // Use array marker for tuples
            chunks.push(marker);

            // Handle rest parameter if present
            if (rt.hasRestParameter()) {
                const nonRestTypes = childTypes.slice(0, -1);
                const restType = childTypes[childTypes.length - 1];

                // Serialize length
                const lengthBuffer = new ArrayBuffer(4);
                const lengthView = new DataView(lengthBuffer);
                lengthView.setUint32(0, value.length, true);
                chunks.push(new Uint8Array(lengthBuffer));

                // Serialize non-rest elements
                for (let i = 0; i < nonRestTypes.length; i++) {
                    ctx.stack.push(nonRestTypes[i]);
                    _toBinary(value[i], nonRestTypes[i], chunks, ctx);
                    ctx.stack.pop();
                }

                // Serialize rest elements
                const restMemberType = (restType as unknown as RestParamsRunType).getMemberType();
                for (let i = nonRestTypes.length; i < value.length; i++) {
                    ctx.stack.push(restMemberType);
                    _toBinary(value[i], restMemberType, chunks, ctx);
                    ctx.stack.pop();
                }
            } else {
                // Serialize length
                const lengthBuffer = new ArrayBuffer(4);
                const lengthView = new DataView(lengthBuffer);
                lengthView.setUint32(0, childTypes.length, true);
                chunks.push(new Uint8Array(lengthBuffer));

                // Serialize each tuple element
                for (let i = 0; i < childTypes.length; i++) {
                    ctx.stack.push(childTypes[i]);
                    _toBinary(value[i], childTypes[i], chunks, ctx);
                    ctx.stack.pop();
                }
            }
            break;
        }

        case ReflectionKind.intersection:
        case ReflectionKind.objectLiteral: {
            if (runType instanceof NonSerializableRunType) {
                throw new Error(`Serialization is disabled for Non Serializable types.`);
            } else {
                const rt = runType as InterfaceRunType;
                if (rt.isCallable()) {
                    throw new Error('Cannot serialize function types.');
                }

                const properties = rt.getChildRunTypes() as PropertyRunType[];
                serializeObject(value, chunks, ctx, properties);
            }
            break;
        }

        case ReflectionKind.class:
            _serializeClass(value, runType, chunks, ctx);
            break;

        case ReflectionKind.union: {
            const rt = runType as UnionRunType;
            const childTypes = rt.getChildRunTypes();

            // Find the matching type for the value
            let matchingTypeIndex = -1;
            for (let i = 0; i < childTypes.length; i++) {
                const isTypeFn = childTypes[i].createJitFunction(JitFunctions.isType);
                if (isTypeFn(value)) {
                    matchingTypeIndex = i;
                    break;
                }
            }

            if (matchingTypeIndex === -1) {
                throw new Error('Value does not match any type in the union.');
            }

            // Serialize the union index and the value
            const indexBuffer = new ArrayBuffer(4);
            const indexView = new DataView(indexBuffer);
            indexView.setUint32(0, matchingTypeIndex, true);
            chunks.push(new Uint8Array(indexBuffer));

            ctx.stack.push(childTypes[matchingTypeIndex]);
            _toBinary(value, childTypes[matchingTypeIndex], chunks, ctx);
            ctx.stack.pop();
            break;
        }

        case ReflectionKind.function:
        case ReflectionKind.callSignature:
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
            throw new Error('Cannot serialize function types.');

        case ReflectionKind.promise:
            throw new Error('Cannot serialize Promise directly. Resolve the promise before serializing.');

        // Member types
        case ReflectionKind.tupleMember:
        case ReflectionKind.parameter: {
            const rt = runType as ParameterRunType;
            if (!rt.getJitChild()) {
                serializeUndefined(chunks);
                return;
            }

            const memberType = rt.getMemberType();
            ctx.stack.push(memberType);
            _toBinary(value, memberType, chunks, ctx);
            ctx.stack.pop();
            break;
        }

        case ReflectionKind.propertySignature:
        case ReflectionKind.property: {
            const rt = runType as PropertyRunType;
            const memberType = rt.getMemberType();
            ctx.stack.push(memberType);
            _toBinary(value, memberType, chunks, ctx);
            ctx.stack.pop();
            break;
        }

        case ReflectionKind.rest: {
            const rt = runType as RestParamsRunType;

            if (!Array.isArray(value)) {
                throw new Error('Expected an array for rest parameters.');
            }

            const memberType = rt.getMemberType();
            serializeArray(value, chunks, ctx, memberType);
            break;
        }

        case ReflectionKind.indexSignature: {
            const rt = runType as IndexSignatureRunType;
            const indexKind = rt.src.index.kind;
            const memberType = rt.getMemberType();

            // Get all keys that match the index signature type
            const keys = Object.keys(value).filter((key) => {
                switch (indexKind) {
                    case ReflectionKind.number:
                        return !isNaN(Number(key));
                    case ReflectionKind.string:
                        return true; // All keys are strings in JavaScript
                    case ReflectionKind.symbol:
                        return typeof key === 'symbol';
                    default:
                        return false;
                }
            });

            // Serialize the number of entries
            const countBuffer = new ArrayBuffer(4);
            const countView = new DataView(countBuffer);
            countView.setUint32(0, keys.length, true);
            chunks.push(new Uint8Array(countBuffer));

            // For each key, serialize the key and value
            for (const key of keys) {
                // Serialize the key based on its type
                switch (indexKind) {
                    case ReflectionKind.number:
                        serializeNumber(Number(key), chunks);
                        break;
                    case ReflectionKind.string:
                        serializeString(key, chunks);
                        break;
                    case ReflectionKind.symbol:
                        serializeSymbol(key as unknown as symbol, chunks);
                        break;
                }

                // Serialize the value
                ctx.stack.push(memberType);
                _toBinary(value[key], memberType, chunks, ctx);
                ctx.stack.pop();
            }
            break;
        }

        case ReflectionKind.infer:
        case ReflectionKind.templateLiteral:
        case ReflectionKind.typeParameter:
        default:
            throw new Error(`Unsupported RunType for serialization: ${runType.getTypeName()}`);
    }
}

/**
 * Serialize class instances based on their subKind
 */
function _serializeClass(value: any, runType: BaseRunType, chunks: Uint8Array[], ctx: BinarySerializationContext): void {
    switch (runType.src.subKind) {
        case ReflectionSubKind.date:
            serializeDate(value, chunks);
            break;

        case ReflectionSubKind.map: {
            if (!(value instanceof Map)) {
                throw new Error('Expected a Map instance.');
            }

            const mapRunType = runType as unknown as MapRunType;
            serializeMap(value, chunks, ctx, mapRunType.keyRT, mapRunType.valueRT);
            break;
        }

        case ReflectionSubKind.set: {
            if (!(value instanceof Set)) {
                throw new Error('Expected a Set instance.');
            }

            const setRunType = runType as unknown as SetRunType;
            serializeSet(value, chunks, ctx, setRunType.keyRT);
            break;
        }

        case ReflectionSubKind.nonSerializable:
            throw new Error(`Serialization is disabled for Non Serializable types.`);

        default: {
            if (!(runType instanceof ClassRunType)) {
                throw new Error(`Unsupported RunType for serialization: ${runType.getTypeName()}`);
            }

            const rt = runType as ClassRunType;
            const isSerializable = rt.isSerializableClass();

            if (!isSerializable) {
                throw new Error(
                    `Class ${rt.getClassName()} cannot be serialized. Only classes with an empty constructor can be serialized.`
                );
            }

            // Serialize class instance as an object
            const properties = rt.getJitChildren() as PropertyRunType[];
            serializeObject(value, chunks, ctx, properties);
            break;
        }
    }
}

// Serialization helper functions for primitive types

function serializeNull(chunks: Uint8Array[]): void {
    chunks.push(new Uint8Array([TYPE_MARKERS.NULL]));
}

function serializeUndefined(chunks: Uint8Array[]): void {
    chunks.push(new Uint8Array([TYPE_MARKERS.UNDEFINED]));
}

function serializeBoolean(value: boolean, chunks: Uint8Array[]): void {
    chunks.push(new Uint8Array([value ? TYPE_MARKERS.BOOLEAN_TRUE : TYPE_MARKERS.BOOLEAN_FALSE]));
}

function serializeNumber(value: number, chunks: Uint8Array[]): void {
    const marker = new Uint8Array([TYPE_MARKERS.NUMBER]);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, true); // true for little-endian

    chunks.push(marker);
    chunks.push(new Uint8Array(buffer));
}

function serializeString(value: string, chunks: Uint8Array[], includeMarker: boolean = true): void {
    const encoder = new TextEncoder();
    const stringBytes = encoder.encode(value);

    if (includeMarker) {
        chunks.push(new Uint8Array([TYPE_MARKERS.STRING]));
    }

    // Add string length as uint32
    const lengthBuffer = new ArrayBuffer(4);
    const lengthView = new DataView(lengthBuffer);
    lengthView.setUint32(0, stringBytes.length, true);
    chunks.push(new Uint8Array(lengthBuffer));

    // Add string data
    chunks.push(stringBytes);
}

function serializeBigInt(value: bigint, chunks: Uint8Array[]): void {
    // Convert BigInt to string for serialization
    const bigIntStr = value.toString();
    const marker = new Uint8Array([TYPE_MARKERS.BIGINT]);

    chunks.push(marker);
    serializeString(bigIntStr, chunks, false); // false to skip the string marker
}

function serializeSymbol(value: symbol, chunks: Uint8Array[]): void {
    const description = value.description || '';
    const marker = new Uint8Array([TYPE_MARKERS.SYMBOL]);

    chunks.push(marker);
    serializeString(description, chunks, false);
}

function serializeDate(value: Date, chunks: Uint8Array[]): void {
    const marker = new Uint8Array([TYPE_MARKERS.DATE]);
    const timestamp = value.getTime();
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, timestamp, true);

    chunks.push(marker);
    chunks.push(new Uint8Array(buffer));
}

function serializeRegExp(value: RegExp, chunks: Uint8Array[]): void {
    const marker = new Uint8Array([TYPE_MARKERS.REGEXP]);
    chunks.push(marker);

    // Serialize pattern and flags
    serializeString(value.source, chunks, false);
    serializeString(value.flags, chunks, false);
}
