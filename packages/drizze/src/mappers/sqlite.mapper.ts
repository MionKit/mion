/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {text, integer, real, blob} from 'drizzle-orm/sqlite-core';
import {ReflectionKind} from '@deepkit/type';
import {TypedError} from '@mionkit/core';
import {BaseColumnMapper} from './base.mapper';
import type {ColumnMapping} from '../types/common.types';
import {DrizzleTypesSQLite} from '../types/common.types';
import {isIntegerFormat} from '../core/utils';
import {FormatName, FormatNames} from '@mionkit/type-formats';

/** SQLite-specific column mapper */
export class SQLiteColumnMapper extends BaseColumnMapper {
    mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping {
        switch (kind) {
            case ReflectionKind.string:
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};
            case ReflectionKind.number:
                return {builder: real(propName), drizzleType: DrizzleTypesSQLite.real};
            case ReflectionKind.boolean:
                return {builder: integer(propName, {mode: 'boolean'}), drizzleType: DrizzleTypesSQLite.integer};
            case ReflectionKind.bigint:
                return {builder: blob(propName, {mode: 'bigint'}), drizzleType: DrizzleTypesSQLite.blob};
            default:
                throw new TypedError({
                    type: 'drizzle-column-mapping-failed',
                    message: `Cannot map property "${propName}" to SQLite column. TypeScript primitive type "${ReflectionKind[kind]}" has no corresponding drizzle column type.`,
                });
        }
    }

    mapFormat(formatName: FormatName, formatParams: Record<string, any> | undefined, propName: string): ColumnMapping {
        switch (formatName) {
            // UUID formats - SQLite uses text for all string formats
            case FormatNames.uuid:
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};

            // Email format
            case FormatNames.email:
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};

            // URL format
            case FormatNames.url:
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};

            // Domain format
            case FormatNames.domain:
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};

            // IP format
            case FormatNames.ip:
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};

            // DateTime format - SQLite stores as text in ISO format
            case FormatNames.dateTime:
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};

            // Date format
            case FormatNames.date:
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};

            // Time format
            case FormatNames.time:
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};

            // Number format
            case FormatNames.numberFormat: {
                if (isIntegerFormat(formatParams)) {
                    return {builder: integer(propName), drizzleType: DrizzleTypesSQLite.integer};
                }
                return {builder: real(propName), drizzleType: DrizzleTypesSQLite.real};
            }

            // BigInt format
            case FormatNames.bigintFormat:
                return {builder: blob(propName, {mode: 'bigint'}), drizzleType: DrizzleTypesSQLite.blob};

            // String format with constraints - SQLite doesn't enforce length
            case FormatNames.stringFormat:
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};

            default:
                // Fall back to text for unknown formats
                return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};
        }
    }

    mapArray(propName: string): ColumnMapping {
        // SQLite: Use text with json mode for arrays
        return {builder: text(propName, {mode: 'json'}), drizzleType: DrizzleTypesSQLite.text};
    }

    mapObject(propName: string): ColumnMapping {
        // SQLite: Use text with json mode for nested objects
        return {builder: text(propName, {mode: 'json'}), drizzleType: DrizzleTypesSQLite.text};
    }

    mapDate(propName: string): ColumnMapping {
        // SQLite: Use integer for timestamps (Unix timestamp)
        return {builder: integer(propName, {mode: 'timestamp'}), drizzleType: DrizzleTypesSQLite.integer};
    }
}
