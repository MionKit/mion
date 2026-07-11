/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType, getRunTypeFormat, isInterfaceRunType, isPropertyRunType, isPropertySignatureRunType} from '@mionjs/run-types';
import type {BaseRunType, InterfaceRunType, PropertyRunType} from '@mionjs/run-types';
import {ReflectionKind, type ReceiveType} from '@deepkit/type';
import {TypedError} from '@mionjs/core';
import type {PropertyInfo, TypeInfo} from '../types/common.types.ts';

/** Extracts property information from a TypeScript type using mion's RunType system */
export function extractTypeInfo<T>(type?: ReceiveType<T>): TypeInfo {
    const rt = runType(type) as BaseRunType;

    // Must be an interface/object type
    if (!isInterfaceRunType(rt)) {
        throw new TypedError({
            type: 'drizzle-table-invalid-source-type',
            message: `Cannot create drizzle table from type "${rt.getKindName()}". Expected an interface or object type with properties to map to table columns.`,
        });
    }

    const interfaceRt = rt as InterfaceRunType;
    const properties: PropertyInfo[] = [];

    // Get all property children
    const children = interfaceRt.getChildRunTypes();

    for (const child of children) {
        if (isPropertyRunType(child) || isPropertySignatureRunType(child)) {
            const propRt = child as PropertyRunType;
            const memberType = propRt.getMemberType() as BaseRunType;
            const propInfo = extractPropertyInfo(propRt, memberType);
            properties.push(propInfo);
        }
    }

    return {
        typeName: rt.getTypeName(),
        properties,
    };
}

/** Extracts information about a single property */
function extractPropertyInfo(propRt: PropertyRunType, memberType: BaseRunType): PropertyInfo {
    const kind = memberType.src.kind;
    const formatInfo = getFormatInfo(memberType);
    const isDate = checkIsDateType(memberType);

    return {
        name: propRt.getPropertyName() as string,
        runType: memberType,
        isOptional: propRt.isOptional(),
        isNestedObject: isNestedObjectType(kind) && !isDate,
        isArray: kind === ReflectionKind.array,
        isDate,
        formatName: formatInfo?.name,
        formatParams: formatInfo?.params,
        primitiveKind: isPrimitiveKind(kind) ? kind : undefined,
    };
}

/** Checks if a ReflectionKind represents a nested object type */
function isNestedObjectType(kind: ReflectionKind): boolean {
    return kind === ReflectionKind.objectLiteral || kind === ReflectionKind.class;
}

/** Checks if a ReflectionKind represents a primitive type */
function isPrimitiveKind(kind: ReflectionKind): boolean {
    return (
        kind === ReflectionKind.string ||
        kind === ReflectionKind.number ||
        kind === ReflectionKind.boolean ||
        kind === ReflectionKind.bigint
    );
}

/** Gets format information from a RunType if it has a format annotation */
function getFormatInfo(rt: BaseRunType): {name: string; params: Record<string, any>} | undefined {
    const format = getRunTypeFormat(rt);
    if (!format) return undefined;

    return {
        name: format.name,
        params: format.getParams(rt),
    };
}

/** Checks if a type is a Date type by examining the class name */
function checkIsDateType(rt: BaseRunType): boolean {
    if (rt.src.kind !== ReflectionKind.class) return false;
    // Check if the class is Date by looking at the type name or classType
    const src = rt.src as any;
    if (src.classType === Date) return true;
    // Also check the type name
    const typeName = rt.getTypeName();
    return typeName === 'Date';
}

/** Checks if a type is a Date type */
export function isDateType(kind: ReflectionKind): boolean {
    return kind === ReflectionKind.class; // Date is a class type
}

/** Gets the underlying type kind, unwrapping unions with null/undefined */
export function getUnderlyingKind(rt: BaseRunType): ReflectionKind {
    const kind = rt.src.kind;

    // Handle union types (e.g., string | null)
    if (kind === ReflectionKind.union) {
        const children = (rt as any).getChildRunTypes?.() || [];
        for (const child of children) {
            const childKind = (child as BaseRunType).src.kind;
            // Skip null and undefined
            if (childKind !== ReflectionKind.null && childKind !== ReflectionKind.undefined) {
                return childKind;
            }
        }
    }

    return kind;
}
