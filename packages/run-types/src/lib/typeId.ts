/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type, TypeIndexSignature, TypeProperty, ReflectionKind, TypeClass, typeAnnotation} from '@deepkit/type';
import {MAX_STACK_DEPTH, TypeFormatParams} from '@mionjs/core';
import {ReflectionSubKind} from '../constants.kind.ts';
import {hasType, hasTypes, hasParameters} from './guards.ts';
import {getFormatterFromCache, defaultIgnoreFormatProps} from './formats.ts';
import {typeParamsToString} from './utils.ts';
import type {FormatAnnotation, SrcType, StrNumber} from '../types.ts';

/** Type with optional cached _typeId and _formatId properties - compatible with SrcType */
export type TypeWithCachedIds = Type & Pick<Partial<SrcType>, '_typeId' | '_formatId'>;

/** Generates a unique type ID directly from a deepkit Type object. Caches result in type._typeId */
export function createTypeId(type: TypeWithCachedIds, stack: Type[] = []): StrNumber {
    if (type._typeId !== undefined) return type._typeId;
    const typeId = _createTypeId(type, stack);
    (type as any)._typeId = typeId;
    return typeId;
}

function _createTypeId(type: Type, stack: Type[]): StrNumber {
    if (stack.length > MAX_STACK_DEPTH) {
        throw new Error(`Max stack depth exceeded while computing type ID. This usually indicates a circular type reference.`);
    }
    const circularId = checkCircularAndGetRefId(type, stack);
    if (circularId !== undefined) return circularId;
    const kind = (type as any).subKind || type.kind;
    const baseTypeId = computeBaseTypeId(type, kind, stack);
    const formatId = computeDeepkitFormatID(type as TypeWithCachedIds);
    if (formatId) return `${baseTypeId}${formatId}`;
    return baseTypeId;
}

function computeBaseTypeId(type: Type, kind: number, stack: Type[]): StrNumber {
    const subKind = (type as any).subKind;
    if (subKind === ReflectionSubKind.params) return computeParamsTypeId(type, stack);

    switch (type.kind) {
        // Atomic types - just return the kind
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
        case ReflectionKind.enum:
        case ReflectionKind.enumMember:
        case ReflectionKind.promise:
            return kind;
        case ReflectionKind.literal: {
            const literal = (type as any).literal;
            return `${kind}:${String(literal)}`;
        }
        // Collection types - contain multiple child types
        case ReflectionKind.union:
        case ReflectionKind.intersection:
        case ReflectionKind.objectLiteral:
        case ReflectionKind.tuple:
            return computeCollectionTypeId(type, stack);
        // Member types - contain a single child type
        case ReflectionKind.array:
        case ReflectionKind.property:
        case ReflectionKind.propertySignature:
        case ReflectionKind.tupleMember:
        case ReflectionKind.parameter:
        case ReflectionKind.rest:
        case ReflectionKind.indexSignature:
            return computeMemberTypeId(type, stack);
        // Function types
        case ReflectionKind.function: {
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
            return computeFunctionTypeId(type);
        // Class types
        case ReflectionKind.class:
            return computeClassTypeId(type as TypeClass, stack);
        default:
            if (hasTypes(type)) return computeCollectionTypeId(type, stack);
            if (hasType(type)) return computeMemberTypeId(type, stack);
            return kind;
    }
}

function computeCollectionTypeId(type: Type, stack: Type[]): StrNumber {
    const types = (type as any).types as Type[] | undefined;
    if (!Array.isArray(types)) return (type as any).subKind || type.kind;
    stack.push(type);
    const childIds: StrNumber[] = [];
    for (const childType of types) childIds.push(_createTypeId(childType, stack));
    stack.pop();
    const isTuple = type.kind === ReflectionKind.tuple;
    const groupID = isTuple ? `[${childIds.join(',')}]` : `{${childIds.join(',')}}`;
    const kind = (type as any).subKind || type.kind;
    return `${kind}${groupID}`;
}

function computeMemberTypeId(type: Type, stack: Type[]): StrNumber {
    const memberType = (type as any).type as Type | undefined;
    if (!memberType || typeof memberType.kind !== 'number') return (type as any).subKind || type.kind;
    const isRest = memberType.kind === ReflectionKind.rest;
    const isTupleParam = type.kind === ReflectionKind.tupleMember || type.kind === ReflectionKind.parameter;
    const hasDefault = isTupleParam && (type as any).default !== undefined;
    const optional = (type as any).optional || type.kind === ReflectionKind.indexSignature || isRest || hasDefault ? '?' : '';
    const propName =
        (type as TypeProperty).name?.toString() || (type as TypeIndexSignature).index?.kind || (type as any).subKind || type.kind;
    const kindID = `${propName}${optional}`;
    const circularId = checkCircularAndGetRefId(type, stack);
    if (circularId) return `${kindID}:${circularId}`;
    stack.push(type);
    const memberTypeId = _createTypeId(memberType, stack);
    stack.pop();
    return `${kindID}:${memberTypeId}`;
}

function computeFunctionTypeId(type: Type): StrNumber {
    const kind = ReflectionKind.function;
    const parent = type.parent;
    const name = (type as any).name;
    let baseId: string;
    if (name && parent && (parent.kind === ReflectionKind.objectLiteral || parent.kind === ReflectionKind.class)) {
        baseId = `${kind}${String(name)}`;
    } else {
        baseId = String(kind);
    }
    const isOptional = !!(type as any).optional;
    return isOptional ? `${baseId}:?` : baseId;
}

function computeClassTypeId(type: TypeClass, stack: Type[]): StrNumber {
    if (type.classType === Date) return ReflectionSubKind.date;
    if (type.classType === Map) {
        const args = type.arguments;
        if (!args || args.length !== 2) return ReflectionSubKind.map;
        stack.push(type);
        const keyTypeId = _createTypeId(args[0], stack);
        const valueTypeId = _createTypeId(args[1], stack);
        stack.pop();
        return `${ReflectionSubKind.map}{${ReflectionSubKind.mapKey}:${keyTypeId},${ReflectionSubKind.mapValue}:${valueTypeId}}`;
    }
    if (type.classType === Set) {
        const args = type.arguments;
        if (!args || args.length !== 1) return ReflectionSubKind.set;
        stack.push(type);
        const itemTypeId = _createTypeId(args[0], stack);
        stack.pop();
        return `${ReflectionSubKind.set}{${ReflectionSubKind.setItem}:${itemTypeId}}`;
    }
    const kind = (type as any).subKind || type.kind;
    const types = (type as any).types as Type[] | undefined;
    if (Array.isArray(types) && types.length > 0) {
        stack.push(type);
        const childIds = types.map((t) => _createTypeId(t, stack));
        stack.pop();
        return `${kind}{${childIds.join(',')}}`;
    }
    return kind;
}

function computeParamsTypeId(type: Type, stack: Type[]): StrNumber {
    if (!hasParameters(type)) return (type as any).subKind || type.kind;
    const circularId = checkCircularAndGetRefId(type, stack);
    if (circularId) return circularId;
    stack.push(type);
    const childIds: StrNumber[] = [];
    for (const param of type.parameters) childIds.push(_createTypeId(param, stack));
    stack.pop();
    const kind = (type as any).subKind || type.kind;
    return `${kind}{${childIds.join(',')}}`;
}

function checkCircularAndGetRefId(type: Type, stack: Type[]): StrNumber | undefined {
    const inStackIndex = stack.findIndex((t) => {
        if (t === type) return true;
        return t.id && type.id && t.id === type.id;
    });
    if (inStackIndex >= 0) {
        const name = type.typeName || '';
        return '$' + type.kind + `_${inStackIndex}` + name;
    }
    return undefined;
}

/** Computes the format ID from a deepkit Type. Caches result in type._formatId */
export function computeDeepkitFormatID(deepkitType: TypeWithCachedIds): string | undefined {
    if (deepkitType._formatId !== undefined) return deepkitType._formatId || undefined;
    const annotations = typeAnnotation.getAnnotations(deepkitType);
    if (annotations.length === 0) {
        (deepkitType as any)._formatId = '';
        return undefined;
    }
    for (const annotation of annotations) {
        const formatAnnotation = annotation as FormatAnnotation;
        if (!formatAnnotation.name) continue;
        const formatter = getFormatterFromCache(deepkitType.kind, formatAnnotation.name);
        if (!formatter) continue;
        const params = typeAnnotation.getOption(deepkitType, formatAnnotation.name) as TypeFormatParams;
        if (!params) continue;
        const formatId = `<${typeParamsToString(params, defaultIgnoreFormatProps)}>`;
        (deepkitType as any)._formatId = formatId;
        return formatId;
    }
    (deepkitType as any)._formatId = '';
    return undefined;
}
