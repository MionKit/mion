/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {int, boolean, double, bigint, timestamp, date, time, varchar, json, datetime} from 'drizzle-orm/mysql-core';
import {ReflectionKind} from '@deepkit/type';
import {TypedError} from '@mionkit/core';
import {BaseColumnMapper} from './base.mapper';
import type {ColumnMapping, DrizzleMapperConfig} from '../types/common.types';
import {DrizzleTypesMySQL, DEFAULT_VARCHAR_LENGTH} from '../types/common.types';
import {getMaxLengthFromParams, isIntegerFormat} from '../core/utils';
import {FormatName, FormatNames} from '@mionkit/type-formats';

/** MySQL-specific column mapper */
export class MySQLColumnMapper extends BaseColumnMapper {
    constructor(config?: DrizzleMapperConfig) {
        super(config);
    }

    mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping {
        switch (kind) {
            case ReflectionKind.string:
                // Use varchar with default length for all string primitives
                return {builder: varchar(propName, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesMySQL.varchar};
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

            // Email format - well-known max length, no buffer needed
            case FormatNames.email: {
                const maxLength = getMaxLengthFromParams(formatParams) || 254;
                return {builder: varchar(propName, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
            }

            // URL format - well-known max length, no buffer needed
            case FormatNames.url: {
                const maxLength = getMaxLengthFromParams(formatParams) || 2048;
                return {builder: varchar(propName, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
            }

            // Domain format - well-known max length, no buffer needed
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
                    return {
                        builder: varchar(propName, {length: this.applyLengthBuffer(maxLength)}),
                        drizzleType: DrizzleTypesMySQL.varchar,
                    };
                }
                return {builder: varchar(propName, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesMySQL.varchar};
            }

            default:
                // Fall back to varchar for unknown formats
                return {builder: varchar(propName, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesMySQL.varchar};
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
