/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {int, boolean, double, bigint, timestamp, date, time, varchar, json, datetime} from 'drizzle-orm/mysql-core';
import {RunTypeKind} from '@mionjs/run-types';
import type {RunTypeKindValue} from '@mionjs/run-types';
import {TypedError} from '@mionjs/core';
import {BaseColumnMapper} from './base.mapper.ts';
import {getRunTypeKindName} from '../core/typeTraverser.ts';
import type {ColumnMapping, DrizzleMapperConfig, PrimitiveColumnFactory, FormatColumnFactory} from '../types/common.types.ts';
import {DrizzleTypesMySQL, DEFAULT_VARCHAR_LENGTH, DEFAULT_LENGTH_BUFFER} from '../types/common.types.ts';
import {getMaxLengthFromParams, isIntegerFormat} from '../core/utils.ts';
import {FormatName, FormatNames} from '@mionjs/type-formats/constants';

// ============================================================================
// Default Mapping Objects
// ============================================================================

/** Default primitive-to-column mapping for MySQL, keyed by RunTypeKind */
const mysqlPrimitiveDefaults: Record<number, PrimitiveColumnFactory> = {
    [RunTypeKind.string]: (p) => ({
        builder: varchar(p, {length: DEFAULT_VARCHAR_LENGTH}),
        drizzleType: DrizzleTypesMySQL.varchar,
    }),
    [RunTypeKind.number]: (p) => ({builder: double(p), drizzleType: DrizzleTypesMySQL.double}),
    [RunTypeKind.boolean]: (p) => ({builder: boolean(p), drizzleType: DrizzleTypesMySQL.boolean}),
    [RunTypeKind.bigint]: (p) => ({builder: bigint(p, {mode: 'bigint'}), drizzleType: DrizzleTypesMySQL.bigint}),
};

/** Default format-to-column mapping for MySQL, keyed by FormatName */
const mysqlFormatDefaults: Record<string, FormatColumnFactory> = {
    [FormatNames.uuid]: (p) => ({builder: varchar(p, {length: 36}), drizzleType: DrizzleTypesMySQL.varchar}),
    [FormatNames.email]: (p, params) => {
        const maxLength = getMaxLengthFromParams(params) || 254;
        return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
    },
    [FormatNames.url]: (p, params) => {
        const maxLength = getMaxLengthFromParams(params) || 2048;
        return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
    },
    [FormatNames.domain]: (p, params) => {
        const maxLength = getMaxLengthFromParams(params) || 253;
        return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
    },
    [FormatNames.ip]: (p) => ({builder: varchar(p, {length: 45}), drizzleType: DrizzleTypesMySQL.varchar}),
    [FormatNames.dateTime]: (p) => ({builder: datetime(p), drizzleType: DrizzleTypesMySQL.datetime}),
    [FormatNames.date]: (p) => ({builder: date(p), drizzleType: DrizzleTypesMySQL.date}),
    [FormatNames.time]: (p) => ({builder: time(p), drizzleType: DrizzleTypesMySQL.time}),
    [FormatNames.bigintFormat]: (p) => ({builder: bigint(p, {mode: 'bigint'}), drizzleType: DrizzleTypesMySQL.bigint}),
    [FormatNames.numberFormat]: (p, params) => {
        if (isIntegerFormat(params)) return {builder: int(p), drizzleType: DrizzleTypesMySQL.int};
        return {builder: double(p), drizzleType: DrizzleTypesMySQL.double};
    },
    [FormatNames.stringFormat]: (p, params, config) => {
        const buf = config?.lengthBuffer ?? DEFAULT_LENGTH_BUFFER;
        const maxLength = getMaxLengthFromParams(params);
        if (maxLength) return {builder: varchar(p, {length: Math.ceil(maxLength * buf)}), drizzleType: DrizzleTypesMySQL.varchar};
        return {builder: varchar(p, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesMySQL.varchar};
    },
};

// ============================================================================
// Mapper Class
// ============================================================================

/** MySQL-specific column mapper */
export class MySQLColumnMapper extends BaseColumnMapper {
    constructor(config?: DrizzleMapperConfig) {
        super(config);
    }

    mapPrimitive(kind: RunTypeKindValue, propName: string): ColumnMapping {
        const factory = mysqlPrimitiveDefaults[kind];
        if (!factory) {
            throw new TypedError({
                type: 'drizzle-column-mapping-failed',
                message: `Cannot map property "${propName}" to MySQL column. TypeScript primitive type "${getRunTypeKindName(kind)}" has no corresponding drizzle column type.`,
            });
        }
        return factory(propName);
    }

    mapFormat(formatName: FormatName, formatParams: Record<string, any> | undefined, propName: string): ColumnMapping {
        const factory = mysqlFormatDefaults[formatName];
        if (!factory)
            return {builder: varchar(propName, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesMySQL.varchar};
        return factory(propName, formatParams, {lengthBuffer: this.lengthBuffer});
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
