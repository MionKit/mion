/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RunTypeKind} from '@ts-runtypes/core';
import type {RunTypeKindValue, FormatName} from '@ts-runtypes/core';
import {TypedError} from '@mionjs/core';
import type {ColumnMapping, PropertyInfo, DrizzleMapperConfig} from '../types/common.types.ts';
import {DEFAULT_LENGTH_BUFFER} from '../types/common.types.ts';
import {shouldBeJson} from '../core/utils.ts';

/** The per-dialect format tables are Record<FormatName, ...> (exhaustive at compile time),
 *  so a runtime miss can only mean a @ts-runtypes/core newer than @mionjs/drizzle. */
export function unknownFormatError(
  formatName: string,
  propName: string,
  dialect: string
): TypedError<'drizzle-column-mapping-failed'> {
  return new TypedError({
    type: 'drizzle-column-mapping-failed',
    message: `Cannot map property "${propName}" to ${dialect} column: format "${formatName}" is unknown to this @mionjs/drizzle version. Update @mionjs/drizzle to match your @ts-runtypes/core.`,
  });
}

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
  abstract mapPrimitive(kind: RunTypeKindValue, propName: string): ColumnMapping;
  /** Maps a format type to a drizzle column */
  abstract mapFormat(formatName: FormatName, formatParams: Record<string, any> | undefined, propName: string): ColumnMapping;
  /** Maps an array type to a JSON column */
  abstract mapArray(propName: string): ColumnMapping;
  /** Maps a nested object type to a JSON column */
  abstract mapObject(propName: string): ColumnMapping;
  /** Maps a Date type to a timestamp column */
  abstract mapDate(propName: string): ColumnMapping;
  /** Maps a string literal / literal-union type to an enum-carrying column */
  abstract mapLiteralUnion(values: string[], propName: string): ColumnMapping;

  /** Maps a property to a drizzle column based on its type information */
  mapProperty(prop: PropertyInfo): ColumnMapping {
    const {name, isOptional, formatName, formatParams} = prop;
    let mapping: ColumnMapping;
    // Format annotation dispatches FIRST: Temporal formats are class kinds and structural
    // formats are array/object kinds, so any later lane would swallow them (the old order
    // sent Temporal props to the JSON lane).
    if (formatName) mapping = this.mapFormat(formatName, formatParams, name);
    // Bare Date (no format annotation)
    else if (prop.isDate) mapping = this.mapDate(name);
    // String literal / literal-union types become enum-carrying columns
    else if (prop.literalValues) mapping = this.mapLiteralUnion(prop.literalValues, name);
    // JSON types (arrays and nested objects)
    else if (shouldBeJson(prop)) {
      if (prop.isArray) mapping = this.mapArray(name);
      else mapping = this.mapObject(name);
    }
    // Primitive type
    else if (prop.primitiveKind !== undefined) mapping = this.mapPrimitive(prop.primitiveKind, name);
    // Fallback to text for unknown types (mixed unions, etc.)
    else mapping = this.mapPrimitive(RunTypeKind.string, name);
    // Apply notNull for required properties
    if (!isOptional && mapping.builder.notNull) mapping.builder = mapping.builder.notNull();
    return mapping;
  }
}
