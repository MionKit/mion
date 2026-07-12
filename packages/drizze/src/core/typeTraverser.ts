/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RunTypeKind} from '@mionjs/run-types';
import type {RunType, RunTypeKindValue} from '@mionjs/run-types';
import {TypedError} from '@mionjs/core';
import type {PropertyInfo, TypeInfo} from '../types/common.types.ts';

/** Resolves the RunTypeKind name for a kind value (RunTypeKind is a const object, no reverse lookup) */
export function getRunTypeKindName(kind: unknown): string {
    const entry = Object.entries(RunTypeKind).find(([, value]) => value === kind);
    return entry ? entry[0] : `unknown-kind(${String(kind)})`;
}

/** Extracts property information from a resolved ts-runtypes RunType graph node */
export function extractTypeInfo(rt: RunType): TypeInfo {
    // Must be an interface/object type
    if (!isObjectLikeNode(rt)) {
        throw new TypedError({
            type: 'drizzle-table-invalid-source-type',
            message: `Cannot create drizzle table from type "${getRunTypeKindName(rt.kind)}". Expected an interface or object type with properties to map to table columns.`,
        });
    }

    const properties: PropertyInfo[] = [];
    // Property nodes hang off `children`; each carries the value type on `child`
    for (const child of rt.children ?? []) {
        if (!isPropertyNode(child) || !child.child) continue;
        properties.push(extractPropertyInfo(child, child.child));
    }

    return {
        typeName: getNodeTypeName(rt),
        properties,
    };
}

/** Extracts information about a single property */
function extractPropertyInfo(propNode: RunType, memberType: RunType): PropertyInfo {
    const kind = memberType.kind as RunTypeKindValue;
    const format = memberType.formatAnnotation;
    const isDate = checkIsDateType(memberType);

    return {
        name: String(propNode.name),
        runType: memberType,
        isOptional: !!propNode.optional,
        isNestedObject: isNestedObjectType(kind) && !isDate,
        isArray: kind === RunTypeKind.array,
        isDate,
        formatName: format?.name,
        formatParams: format?.params as Record<string, any> | undefined,
        primitiveKind: isPrimitiveKind(kind) ? kind : undefined,
    };
}

/** Checks if a RunType node is an interface/object-like type (objectLiteral or class) */
function isObjectLikeNode(rt: RunType): boolean {
    return rt.kind === RunTypeKind.objectLiteral || rt.kind === RunTypeKind.class;
}

/** Checks if a RunType node is a property node (property or propertySignature) */
function isPropertyNode(rt: RunType): boolean {
    return rt.kind === RunTypeKind.property || rt.kind === RunTypeKind.propertySignature;
}

/** Gets the declared type name of a node, falling back to its kind name */
function getNodeTypeName(rt: RunType): string {
    return typeof rt.typeName === 'string' ? rt.typeName : getRunTypeKindName(rt.kind);
}

/** Checks if a RunTypeKind represents a nested object type */
function isNestedObjectType(kind: RunTypeKindValue): boolean {
    return kind === RunTypeKind.objectLiteral || kind === RunTypeKind.class;
}

/** Checks if a RunTypeKind represents a primitive type */
function isPrimitiveKind(kind: RunTypeKindValue): boolean {
    return (
        kind === RunTypeKind.string || kind === RunTypeKind.number || kind === RunTypeKind.boolean || kind === RunTypeKind.bigint
    );
}

/** Checks if a type is a Date type (builtin classes project atomically as kind class + typeName) */
function checkIsDateType(rt: RunType): boolean {
    return rt.kind === RunTypeKind.class && rt.typeName === 'Date';
}

/** Checks if a kind could be a Date type (Date is a class type) */
export function isDateType(kind: RunTypeKindValue): boolean {
    return kind === RunTypeKind.class;
}

/** Gets the underlying type kind, unwrapping unions with null/undefined */
export function getUnderlyingKind(rt: RunType): RunTypeKindValue {
    const kind = rt.kind as RunTypeKindValue;

    // Handle union types (e.g. string | null)
    if (kind === RunTypeKind.union) {
        for (const child of rt.children ?? []) {
            const childKind = child.kind as RunTypeKindValue;
            // Skip null and undefined
            if (childKind !== RunTypeKind.null && childKind !== RunTypeKind.undefined) return childKind;
        }
    }

    return kind;
}
