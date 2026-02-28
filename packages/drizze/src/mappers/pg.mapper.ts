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
import type {ColumnMapping, DrizzleMapperConfig, PrimitiveColumnFactory, FormatColumnFactory} from '../types/common.types.ts';
import {DrizzleTypesPostgres, DEFAULT_VARCHAR_LENGTH, DEFAULT_LENGTH_BUFFER} from '../types/common.types.ts';
import {getMaxLengthFromParams, getLengthFromParams, isIntegerFormat} from '../core/utils.ts';
import {FormatName, FormatNames} from '@mionkit/type-formats/constants';

// ============================================================================
// Default Mapping Objects
// ============================================================================

/** Default primitive-to-column mapping for PostgreSQL, keyed by ReflectionKind */
const pgPrimitiveDefaults: Record<number, PrimitiveColumnFactory> = {
    [ReflectionKind.string]: (p) => ({
        builder: varchar(p, {length: DEFAULT_VARCHAR_LENGTH}),
        drizzleType: DrizzleTypesPostgres.varchar,
    }),
    [ReflectionKind.number]: (p) => ({builder: doublePrecision(p), drizzleType: DrizzleTypesPostgres.doublePrecision}),
    [ReflectionKind.boolean]: (p) => ({builder: boolean(p), drizzleType: DrizzleTypesPostgres.boolean}),
    [ReflectionKind.bigint]: (p) => ({builder: bigint(p, {mode: 'bigint'}), drizzleType: DrizzleTypesPostgres.bigint}),
};

/** Default format-to-column mapping for PostgreSQL, keyed by FormatName */
const pgFormatDefaults: Record<string, FormatColumnFactory> = {
    [FormatNames.uuid]: (p) => ({builder: uuid(p), drizzleType: DrizzleTypesPostgres.uuid}),
    [FormatNames.email]: (p, params) => {
        const maxLength = getMaxLengthFromParams(params) || 254;
        return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesPostgres.varchar};
    },
    [FormatNames.url]: (p, params) => {
        const maxLength = getMaxLengthFromParams(params) || 2048;
        return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesPostgres.varchar};
    },
    [FormatNames.domain]: (p, params) => {
        const maxLength = getMaxLengthFromParams(params) || 253;
        return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesPostgres.varchar};
    },
    [FormatNames.ip]: (p) => ({builder: inet(p), drizzleType: DrizzleTypesPostgres.inet}),
    [FormatNames.dateTime]: (p) => ({builder: timestamp(p), drizzleType: DrizzleTypesPostgres.timestamp}),
    [FormatNames.date]: (p) => ({builder: date(p), drizzleType: DrizzleTypesPostgres.date}),
    [FormatNames.time]: (p) => ({builder: time(p), drizzleType: DrizzleTypesPostgres.time}),
    [FormatNames.bigintFormat]: (p) => ({builder: bigint(p, {mode: 'bigint'}), drizzleType: DrizzleTypesPostgres.bigint}),
    [FormatNames.numberFormat]: (p, params) => {
        if (isIntegerFormat(params)) return {builder: integer(p), drizzleType: DrizzleTypesPostgres.integer};
        return {builder: doublePrecision(p), drizzleType: DrizzleTypesPostgres.doublePrecision};
    },
    [FormatNames.stringFormat]: (p, params, config) => {
        const buf = config?.lengthBuffer ?? DEFAULT_LENGTH_BUFFER;
        const maxLength = getMaxLengthFromParams(params);
        const exactLength = getLengthFromParams(params);
        if (exactLength) return {builder: varchar(p, {length: exactLength}), drizzleType: DrizzleTypesPostgres.varchar};
        if (maxLength)
            return {builder: varchar(p, {length: Math.ceil(maxLength * buf)}), drizzleType: DrizzleTypesPostgres.varchar};
        return {builder: varchar(p, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesPostgres.varchar};
    },
};

// ============================================================================
// Mapper Class
// ============================================================================

/** PostgreSQL-specific column mapper */
export class PGColumnMapper extends BaseColumnMapper {
    constructor(config?: DrizzleMapperConfig) {
        super(config);
    }

    mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping {
        const factory = pgPrimitiveDefaults[kind];
        if (!factory) {
            throw new TypedError({
                type: 'drizzle-column-mapping-failed',
                message: `Cannot map property "${propName}" to PostgreSQL column. TypeScript primitive type "${ReflectionKind[kind]}" has no corresponding drizzle column type.`,
            });
        }
        return factory(propName);
    }

    mapFormat(formatName: FormatName, formatParams: Record<string, any> | undefined, propName: string): ColumnMapping {
        const factory = pgFormatDefaults[formatName];
        if (!factory)
            return {builder: varchar(propName, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesPostgres.varchar};
        return factory(propName, formatParams, {lengthBuffer: this.lengthBuffer});
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
