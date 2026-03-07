/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {ColumnMapping, PropertyInfo, DrizzleMapperConfig} from '../types/common.types.ts';
import {DEFAULT_LENGTH_BUFFER} from '../types/common.types.ts';
import {shouldBeJson} from '../core/utils.ts';
import {FormatName} from '@mionjs/type-formats/constants';

/** Base class for database-specific column mappers */
export abstract class BaseColumnMapper {
    protected lengthBuffer: number;

    constructor(config?: DrizzleMapperConfig) {
        this.lengthBuffer = config?.lengthBuffer ?? DEFAULT_LENGTH_BUFFER;
    }

    /** Applies length buffer to a maxLength value */
    protected applyLengthBuffer(maxLength: number): number {
        return Math.ceil(maxLength * this.lengthBuffer);
    }

    /** Maps a primitive TypeScript type to a drizzle column */
    abstract mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping;
    /** Maps a format type to a drizzle column */
    abstract mapFormat(formatName: FormatName, formatParams: Record<string, any> | undefined, propName: string): ColumnMapping;
    /** Maps an array type to a JSON column */
    abstract mapArray(propName: string): ColumnMapping;
    /** Maps a nested object type to a JSON column */
    abstract mapObject(propName: string): ColumnMapping;
    /** Maps a Date type to a timestamp column */
    abstract mapDate(propName: string): ColumnMapping;

    /** Maps a property to a drizzle column based on its type information */
    mapProperty(prop: PropertyInfo): ColumnMapping {
        const {name, isOptional, formatName, formatParams} = prop;
        let mapping: ColumnMapping;
        // Check for Date type first (before JSON check since Date is a class)
        if (prop.isDate) mapping = this.mapDate(name);
        // Check for JSON types (arrays and nested objects)
        else if (shouldBeJson(prop)) {
            if (prop.isArray) mapping = this.mapArray(name);
            else mapping = this.mapObject(name);
        }
        // Check for format annotation
        else if (formatName) mapping = this.mapFormat(formatName, formatParams, name);
        // Primitive type
        else if (prop.primitiveKind !== undefined) mapping = this.mapPrimitive(prop.primitiveKind, name);
        // Fallback to text for unknown types
        else mapping = this.mapPrimitive(ReflectionKind.string, name);
        // Apply notNull for required properties
        if (!isOptional && mapping.builder.notNull) mapping.builder = mapping.builder.notNull();
        return mapping;
    }
}
