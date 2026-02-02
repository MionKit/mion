/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type, TypeIndexSignature, TypeProperty, ReflectionKind, TypeClass} from '@deepkit/type';
import {MAX_STACK_DEPTH} from '@mionkit/core';
import {ReflectionSubKind} from '../constants.kind';
import {hasType, hasTypes, hasReturn, hasParameters, hasArguments} from './guards';

type StrNumber = string | number;

/** Type with cached _typeId property */
export type TypeWithCachedId = Type & {_typeId?: StrNumber};

/**
 * Generates a unique type ID directly from a deepkit Type object.
 * This mirrors the logic in RunType's getTypeID() but works without needing a RunType instance.
 * Used for caching RunType instances before they are created.
 * The ID is cached on the type object itself via _typeId property.
 * Returns number for atomic types (to match original _getTypeID behavior), string for complex types.
 */
export function getDeepkitTypeId(type: TypeWithCachedId, stack: Type[] = []): StrNumber {
    // Return cached ID if available
    if (type._typeId !== undefined) return type._typeId;

    // Compute the ID
    const typeId = computeDeepkitTypeId(type, stack);

    // Cache on the type object for future lookups
    (type as any)._typeId = typeId;

    return typeId;
}

/** Computes the type ID without caching - internal function */
function computeDeepkitTypeId(type: Type, stack: Type[]): StrNumber {
    if (stack.length > MAX_STACK_DEPTH) {
        throw new Error(`Max stack depth exceeded while computing type ID. This usually indicates a circular type reference.`);
    }

    // Check for circular reference
    const circularId = checkCircularAndGetRefId(type, stack);
    if (circularId !== undefined) return circularId;

    const kind = (type as any).subKind || type.kind;

    // Compute the base type ID first
    const baseTypeId = computeBaseTypeId(type, kind, stack);

    // Check for format annotation and append format ID if present
    const formatId = computeDeepkitFormatID(type);
    if (formatId) {
        return `${baseTypeId}${formatId}`;
    }

    return baseTypeId;
}

/** Computes the base type ID without format information */
function computeBaseTypeId(type: Type, kind: number, stack: Type[]): StrNumber {
    // Handle subKind first (e.g., FunctionParamsRunType has subKind: params)
    const subKind = (type as any).subKind;
    if (subKind === ReflectionSubKind.params) {
        // FunctionParamsRunType - treat as a tuple of parameters
        // Use parameters array instead of types array
        // Note: Use curly braces like CollectionRunType, not array brackets
        return computeParamsTypeId(type, stack);
    }

    // Handle different type kinds based on their structure
    switch (type.kind) {
        // ###################### ATOMIC TYPES ######################
        // These types don't contain other types, just return the kind
        case ReflectionKind.any:
        case ReflectionKind.bigint:
        case ReflectionKind.boolean:
        case ReflectionKind.never:
        case ReflectionKind.null:
        case ReflectionKind.number:
        case ReflectionKind.object:
        case ReflectionKind.regexp:
        case ReflectionKind.string:
        case ReflectionKind.symbol:
        case ReflectionKind.undefined:
        case ReflectionKind.unknown:
        case ReflectionKind.void:
            return kind;

        case ReflectionKind.literal: {
            // Include the literal value in the ID
            // Use String() to handle RegExp, BigInt, Symbol, etc. (matches LiteralRunType._getTypeID)
            const literal = (type as any).literal;
            return `${kind}:${String(literal)}`;
        }

        case ReflectionKind.enum: {
            // Include enum values in the ID
            const values = (type as any).values || [];
            return `${kind}:{${values.map((v: any) => JSON.stringify(v)).join(',')}}`;
        }

        case ReflectionKind.enumMember:
            // Include enum member value
            return `${kind}:${JSON.stringify((type as any).default)}`;

        // ###################### COLLECTION TYPES ######################
        // These types contain multiple child types
        case ReflectionKind.union:
        case ReflectionKind.intersection:
        case ReflectionKind.objectLiteral:
        case ReflectionKind.tuple:
            return computeCollectionTypeId(type, stack);

        // ###################### MEMBER TYPES ######################
        // These types contain a single child type
        case ReflectionKind.array:
        case ReflectionKind.property:
        case ReflectionKind.propertySignature:
        case ReflectionKind.tupleMember:
        case ReflectionKind.parameter:
        case ReflectionKind.rest:
        case ReflectionKind.indexSignature:
        case ReflectionKind.promise:
            return computeMemberTypeId(type, stack);

        // ###################### FUNCTION TYPES ######################
        // Note: FunctionRunType._getTypeID() returns just the kind (17) unless it's a named method
        // in an object/class. We match that behavior here.
        case ReflectionKind.function: {
            // Only include the name if this function is a property in an object/interface/class
            const parent = type.parent;
            const name = (type as any).name;
            if (name && parent && (parent.kind === ReflectionKind.objectLiteral || parent.kind === ReflectionKind.class)) {
                return `${ReflectionKind.function}${String(name)}`;
            }
            return ReflectionKind.function;
        }
        case ReflectionKind.method:
        case ReflectionKind.methodSignature:
        case ReflectionKind.callSignature:
            return computeFunctionTypeId(type, stack);

        // ###################### CLASS TYPES ######################
        case ReflectionKind.class:
            return computeClassTypeId(type as TypeClass, stack);

        // ###################### DEFAULT ######################
        default:
            // For any other types, try to compute based on structure
            if (hasTypes(type)) {
                return computeCollectionTypeId(type, stack);
            }
            if (hasType(type)) {
                return computeMemberTypeId(type, stack);
            }
            return kind;
    }
}

/** Computes type ID for collection types (union, intersection, objectLiteral, tuple) */
function computeCollectionTypeId(type: Type, stack: Type[]): StrNumber {
    if (!hasTypes(type)) return (type as any).subKind || type.kind;

    stack.push(type);
    const childIds: StrNumber[] = [];
    for (const childType of type.types) {
        childIds.push(computeDeepkitTypeId(childType, stack));
    }
    stack.pop();

    // Match CollectionRunType._getTypeID() logic: use [] for tuple, {} for others
    // Note: array kind (25) is handled in computeMemberTypeId, not here
    const isTuple = type.kind === ReflectionKind.tuple;
    const groupID = isTuple ? `[${childIds.join(',')}]` : `{${childIds.join(',')}}`;
    const kind = (type as any).subKind || type.kind;
    return `${kind}${groupID}`;
}

/** Computes type ID for member types (property, array, tupleMember, parameter, etc.) */
function computeMemberTypeId(type: Type, stack: Type[]): StrNumber {
    if (!hasType(type)) return (type as any).subKind || type.kind;

    const optional = (type as any).optional ? '?' : '';
    const propName =
        (type as TypeProperty).name?.toString() || (type as TypeIndexSignature).index?.kind || (type as any).subKind || type.kind;
    const kindID = `${propName}${optional}`;

    // Check for circular reference before recursing
    const circularId = checkCircularAndGetRefId(type, stack);
    if (circularId) return `${kindID}:${circularId}`;

    stack.push(type);
    const memberTypeId = computeDeepkitTypeId(type.type, stack);
    stack.pop();

    return `${kindID}:${memberTypeId}`;
}

/** Computes type ID for function types */
function computeFunctionTypeId(type: Type, stack: Type[]): StrNumber {
    const kind = (type as any).subKind || type.kind;
    const parts: string[] = [];

    // For method signatures, include the method name if it's a property of an object/class
    const parent = type.parent;
    const name = (type as any).name;
    let baseId: string;
    if (name && parent && (parent.kind === ReflectionKind.objectLiteral || parent.kind === ReflectionKind.class)) {
        baseId = `${kind}${String(name)}`;
    } else {
        baseId = String(kind);
    }

    stack.push(type);

    if (hasParameters(type) && type.parameters.length > 0) {
        const paramIds = type.parameters.map((p) => computeDeepkitTypeId(p, stack));
        parts.push(`(${paramIds.join(',')})`);
    }

    if (hasReturn(type)) {
        parts.push(`=>${computeDeepkitTypeId(type.return, stack)}`);
    }

    stack.pop();

    // For method signatures, append :? if optional (mirrors MethodSignatureRunType._getTypeID)
    const isOptional = (type as any).optional;
    const optionalSuffix = isOptional ? ':?' : '';

    return parts.length > 0 ? `${baseId}${parts.join('')}${optionalSuffix}` : `${baseId}${optionalSuffix}`;
}

/** Computes type ID for class types */
function computeClassTypeId(type: TypeClass, stack: Type[]): StrNumber {
    // Handle special built-in classes
    // Date has no type arguments, just return the subKind
    if (type.classType === Date) {
        return ReflectionSubKind.date;
    }

    // Map and Set need to include their type arguments as children
    // This mirrors how MapRunType and SetRunType compute their type IDs
    // They create synthetic child types with specific subKinds (mapKey, mapValue, setItem)
    if (type.classType === Map) {
        const args = type.arguments;
        if (!args || args.length !== 2) return ReflectionSubKind.map;
        stack.push(type);
        // Map children are: mapKey:keyType, mapValue:valueType
        const keyTypeId = computeDeepkitTypeId(args[0], stack);
        const valueTypeId = computeDeepkitTypeId(args[1], stack);
        stack.pop();
        // Format: subKind{mapKeySubKind:keyTypeId,mapValueSubKind:valueTypeId}
        return `${ReflectionSubKind.map}{${ReflectionSubKind.mapKey}:${keyTypeId},${ReflectionSubKind.mapValue}:${valueTypeId}}`;
    }

    if (type.classType === Set) {
        const args = type.arguments;
        if (!args || args.length !== 1) return ReflectionSubKind.set;
        stack.push(type);
        // Set children are: setItem:itemType
        const itemTypeId = computeDeepkitTypeId(args[0], stack);
        stack.pop();
        // Format: subKind{setItemSubKind:itemTypeId}
        return `${ReflectionSubKind.set}{${ReflectionSubKind.setItem}:${itemTypeId}}`;
    }

    const kind = (type as any).subKind || type.kind;
    const className = type.classType?.name || 'UnknownClass';

    // For regular classes, include type arguments if present
    if (hasArguments(type) && type.arguments.length > 0) {
        stack.push(type);
        const argIds = type.arguments.map((a) => computeDeepkitTypeId(a, stack));
        stack.pop();
        return `${kind}:${className}<${argIds.join(',')}>`;
    }

    // For classes with types (properties), compute like a collection
    if (hasTypes(type) && type.types.length > 0) {
        stack.push(type);
        const childIds = type.types.map((t) => computeDeepkitTypeId(t, stack));
        stack.pop();
        return `${kind}:${className}{${childIds.join(',')}}`;
    }

    return `${kind}:${className}`;
}

/** Computes type ID for function params (FunctionParamsRunType) - uses parameters array instead of types */
function computeParamsTypeId(type: Type, stack: Type[]): StrNumber {
    if (!hasParameters(type)) return (type as any).subKind || type.kind;

    // Check for circular reference
    const circularId = checkCircularAndGetRefId(type, stack);
    if (circularId) return circularId;

    stack.push(type);
    const childIds: StrNumber[] = [];
    for (const param of type.parameters) {
        childIds.push(computeDeepkitTypeId(param, stack));
    }
    stack.pop();

    // Use curly braces format like CollectionRunType._getTypeID() does
    // This ensures type IDs match what the original RunType implementation would generate
    const kind = (type as any).subKind || type.kind;
    return `${kind}{${childIds.join(',')}}`;
}

/** Checks if the type is already in the stack (circular reference) and returns a reference ID */
function checkCircularAndGetRefId(type: Type, stack: Type[]): StrNumber | undefined {
    const inStackIndex = stack.findIndex((t) => {
        if (t === type) return true;
        // Check by deepkit's internal id as well
        return t.id && type.id && t.id === type.id;
    });

    if (inStackIndex >= 0) {
        const name = type.typeName || '';
        return '$' + type.kind + `_${inStackIndex}` + name;
    }
    return undefined;
}

// ################# DEEPKIT TYPE FORMAT ID  #################

/**
 * Computes the format ID directly from a deepkit Type object without needing a RunType instance.
 * This is used by getDeepkitTypeId to include format information in the type ID.
 * Returns undefined if the type has no format annotation.
 */
export function computeDeepkitFormatID(deepkitType: Type): string | undefined {
    // Get annotations from the deepkit type
    const annotations = typeAnnotation.getAnnotations(deepkitType);
    if (annotations.length === 0) return undefined;

    // Find the first annotation that has a registered formatter
    for (const annotation of annotations) {
        const formatAnnotation = annotation as FormatAnnotation;
        if (!formatAnnotation.name) continue;

        // Check if there's a registered formatter for this annotation
        const formatter = getFormatterFromCache(deepkitType.kind, formatAnnotation.name);
        if (!formatter) continue;

        // Get the params directly from the deepkit type
        const params = typeAnnotation.getOption(deepkitType, formatAnnotation.name) as TypeFormatParams;
        if (!params) continue;

        // Convert params to string format ID
        return `<${typeParamsToString(params, defaultIgnoreFormatProps)}>`;
    }

    return undefined;
}
