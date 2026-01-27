/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {text, int, boolean, double, bigint, timestamp, date, time, varchar, json, datetime} from 'drizzle-orm/mysql-core';
import {ReflectionKind} from '@deepkit/type';
import {TypedError} from '@mionkit/core';
import {BaseColumnMapper} from './base.mapper';
import type {ColumnMapping} from '../types/common.types';
import {DrizzleTypesMySQL} from '../types/common.types';
import {getMaxLengthFromParams, isIntegerFormat} from '../core/utils';
import {FormatName, FormatNames} from '@mionkit/type-formats';

/** MySQL-specific column mapper */
export class MySQLColumnMapper extends BaseColumnMapper {
    mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping {
        switch (kind) {
            case ReflectionKind.string:
                return {builder: text(propName), drizzleType: DrizzleTypesMySQL.text};
            case ReflectionKind.number:
                return {builder: double(propName), drizzleType: DrizzleTypesMySQL.double};
            case ReflectionKind.boolean:
                return {builder: boolean(propName), drizzleType: DrizzleTypesMySQL.boolean};
            case ReflectionKind.bigint:
                return {builder: bigint(propName, {mode: 'bigint'}), drizzleType: DrizzleTypesMySQL.bigint};
            default:
                throw new TypedError({
                    type: 'drizzle-column-mapping-failed',
                    message: `Cannot map property "${propName}" to MySQL column. TypeScript primitive type "${ReflectionKind[kind]}" has no corresponding drizzle column type.`,
                });
        }
    }

    mapFormat(formatName: FormatName, formatParams: Record<string, any> | undefined, propName: string): ColumnMapping {
        switch (formatName) {
            // UUID formats - MySQL doesn't have native UUID, use varchar(36)
            case FormatNames.uuid:
                return {builder: varchar(propName, {length: 36}), drizzleType: DrizzleTypesMySQL.varchar};

            // Email format
            case FormatNames.email: {
                const maxLength = getMaxLengthFromParams(formatParams) || 254;
                return {builder: varchar(propName, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
            }

            // URL format
            case FormatNames.url:
                return {builder: text(propName), drizzleType: DrizzleTypesMySQL.text};

            // Domain format
            case FormatNames.domain: {
                const maxLength = getMaxLengthFromParams(formatParams) || 253;
                return {builder: varchar(propName, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
            }

            // IP format - IPv6 can be up to 45 chars
            case FormatNames.ip:
                return {builder: varchar(propName, {length: 45}), drizzleType: DrizzleTypesMySQL.varchar};

            // DateTime format
            case FormatNames.dateTime:
                return {builder: datetime(propName), drizzleType: DrizzleTypesMySQL.datetime};

            // Date format
            case FormatNames.date:
                return {builder: date(propName), drizzleType: DrizzleTypesMySQL.date};

            // Time format
            case FormatNames.time:
                return {builder: time(propName), drizzleType: DrizzleTypesMySQL.time};

            // Number format
            case FormatNames.numberFormat: {
                if (isIntegerFormat(formatParams)) {
                    return {builder: int(propName), drizzleType: DrizzleTypesMySQL.int};
                }
                return {builder: double(propName), drizzleType: DrizzleTypesMySQL.double};
            }

            // BigInt format
            case FormatNames.bigintFormat:
                return {builder: bigint(propName, {mode: 'bigint'}), drizzleType: DrizzleTypesMySQL.bigint};

            // String format with constraints
            case FormatNames.stringFormat: {
                const maxLength = getMaxLengthFromParams(formatParams);
                if (maxLength) {
                    return {builder: varchar(propName, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
                }
                return {builder: text(propName), drizzleType: DrizzleTypesMySQL.text};
            }

            default:
                // Fall back to text for unknown formats
                return {builder: text(propName), drizzleType: DrizzleTypesMySQL.text};
        }
    }

    mapArray(propName: string): ColumnMapping {
        return {builder: json(propName), drizzleType: DrizzleTypesMySQL.json};
    }

    mapObject(propName: string): ColumnMapping {
        return {builder: json(propName), drizzleType: DrizzleTypesMySQL.json};
    }

    mapDate(propName: string): ColumnMapping {
        return {builder: timestamp(propName), drizzleType: DrizzleTypesMySQL.timestamp};
    }
}
