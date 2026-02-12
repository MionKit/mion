/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {integer, boolean, doublePrecision, bigint, timestamp, date, time, uuid, jsonb, inet, varchar} from 'drizzle-orm/pg-core';
import {ReflectionKind} from '@deepkit/type';
import {TypedError} from '@mionkit/core';
import {BaseColumnMapper} from './base.mapper.ts';
import type {ColumnMapping, DrizzleMapperConfig} from '../types/common.types.ts';
import {DrizzleTypesPostgres, DEFAULT_VARCHAR_LENGTH} from '../types/common.types.ts';
import {getMaxLengthFromParams, getLengthFromParams, isIntegerFormat} from '../core/utils.ts';
import {FormatName, FormatNames} from '@mionkit/type-formats';

/** PostgreSQL-specific column mapper */
export class PGColumnMapper extends BaseColumnMapper {
    constructor(config?: DrizzleMapperConfig) {
        super(config);
    }

    mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping {
        switch (kind) {
            case ReflectionKind.string:
                // Use varchar with default length for all string primitives
                return {builder: varchar(propName, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesPostgres.varchar};
            case ReflectionKind.number:
                return {builder: doublePrecision(propName), drizzleType: DrizzleTypesPostgres.doublePrecision};
            case ReflectionKind.boolean:
                return {builder: boolean(propName), drizzleType: DrizzleTypesPostgres.boolean};
            case ReflectionKind.bigint:
                return {builder: bigint(propName, {mode: 'bigint'}), drizzleType: DrizzleTypesPostgres.bigint};
            default:
                throw new TypedError({
                    type: 'drizzle-column-mapping-failed',
                    message: `Cannot map property "${propName}" to PostgreSQL column. TypeScript primitive type "${ReflectionKind[kind]}" has no corresponding drizzle column type.`,
                });
        }
    }

    mapFormat(formatName: FormatName, formatParams: Record<string, any> | undefined, propName: string): ColumnMapping {
        switch (formatName) {
            // UUID formats
            case FormatNames.uuid:
                return {builder: uuid(propName), drizzleType: DrizzleTypesPostgres.uuid};

            // Email format - well-known max length, no buffer needed
            case FormatNames.email: {
                const maxLength = getMaxLengthFromParams(formatParams) || 254;
                return {builder: varchar(propName, {length: maxLength}), drizzleType: DrizzleTypesPostgres.varchar};
            }

            // URL format - well-known max length, no buffer needed
            case FormatNames.url: {
                const maxLength = getMaxLengthFromParams(formatParams) || 2048;
                return {builder: varchar(propName, {length: maxLength}), drizzleType: DrizzleTypesPostgres.varchar};
            }

            // Domain format - well-known max length, no buffer needed
            case FormatNames.domain: {
                const maxLength = getMaxLengthFromParams(formatParams) || 253;
                return {builder: varchar(propName, {length: maxLength}), drizzleType: DrizzleTypesPostgres.varchar};
            }

            // IP format
            case FormatNames.ip:
                return {builder: inet(propName), drizzleType: DrizzleTypesPostgres.inet};

            // DateTime format
            case FormatNames.dateTime:
                return {builder: timestamp(propName), drizzleType: DrizzleTypesPostgres.timestamp};

            // Date format
            case FormatNames.date:
                return {builder: date(propName), drizzleType: DrizzleTypesPostgres.date};

            // Time format
            case FormatNames.time:
                return {builder: time(propName), drizzleType: DrizzleTypesPostgres.time};

            // Number format
            case FormatNames.numberFormat: {
                if (isIntegerFormat(formatParams)) {
                    return {builder: integer(propName), drizzleType: DrizzleTypesPostgres.integer};
                }
                return {builder: doublePrecision(propName), drizzleType: DrizzleTypesPostgres.doublePrecision};
            }

            // BigInt format
            case FormatNames.bigintFormat:
                return {builder: bigint(propName, {mode: 'bigint'}), drizzleType: DrizzleTypesPostgres.bigint};

            // String format with constraints
            case FormatNames.stringFormat: {
                const maxLength = getMaxLengthFromParams(formatParams);
                const exactLength = getLengthFromParams(formatParams);

                if (exactLength) {
                    return {builder: varchar(propName, {length: exactLength}), drizzleType: DrizzleTypesPostgres.varchar};
                }
                if (maxLength) {
                    return {
                        builder: varchar(propName, {length: this.applyLengthBuffer(maxLength)}),
                        drizzleType: DrizzleTypesPostgres.varchar,
                    };
                }
                return {builder: varchar(propName, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesPostgres.varchar};
            }

            default:
                // Fall back to varchar for unknown formats
                return {builder: varchar(propName, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesPostgres.varchar};
        }
    }

    mapArray(propName: string): ColumnMapping {
        return {builder: jsonb(propName), drizzleType: DrizzleTypesPostgres.jsonb};
    }

    mapObject(propName: string): ColumnMapping {
        return {builder: jsonb(propName), drizzleType: DrizzleTypesPostgres.jsonb};
    }

    mapDate(propName: string): ColumnMapping {
        return {builder: timestamp(propName), drizzleType: DrizzleTypesPostgres.timestamp};
    }
}
