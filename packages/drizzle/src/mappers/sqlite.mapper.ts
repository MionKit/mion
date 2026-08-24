/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {text, integer, real, blob} from 'drizzle-orm/sqlite-core';
import {RunTypeKind} from '@ts-runtypes/core';
import type {RunTypeKindValue} from '@ts-runtypes/core';
import {TypedError} from '@mionjs/core';
import {BaseColumnMapper} from './base.mapper.ts';
import {getRunTypeKindName} from '../core/typeTraverser.ts';
import type {ColumnMapping, DrizzleMapperConfig, PrimitiveColumnFactory, FormatColumnFactory} from '../types/common.types.ts';
import {DrizzleTypesSQLite} from '../types/common.types.ts';
import {isIntegerFormat} from '../core/utils.ts';
import {typeFormats} from '@ts-runtypes/core';
import type {FormatName} from '@ts-runtypes/core';

// ============================================================================
// Default Mapping Objects
// ============================================================================

/** Default primitive-to-column mapping for SQLite, keyed by RunTypeKind */
const sqlitePrimitiveDefaults: Record<number, PrimitiveColumnFactory> = {
    [RunTypeKind.string]: (p) => ({builder: text(p), drizzleType: DrizzleTypesSQLite.text}),
    [RunTypeKind.number]: (p) => ({builder: real(p), drizzleType: DrizzleTypesSQLite.real}),
    [RunTypeKind.boolean]: (p) => ({builder: integer(p, {mode: 'boolean'}), drizzleType: DrizzleTypesSQLite.integer}),
    [RunTypeKind.bigint]: (p) => ({builder: blob(p, {mode: 'bigint'}), drizzleType: DrizzleTypesSQLite.blob}),
};

/** Default format-to-column mapping for SQLite, keyed by FormatName */
const sqliteFormatDefaults: Record<string, FormatColumnFactory> = {
    [typeFormats.uuid.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesSQLite.text}),
    [typeFormats.email.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesSQLite.text}),
    [typeFormats.url.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesSQLite.text}),
    [typeFormats.domain.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesSQLite.text}),
    [typeFormats.ip.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesSQLite.text}),
    [typeFormats.dateTime.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesSQLite.text}),
    [typeFormats.date.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesSQLite.text}),
    [typeFormats.time.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesSQLite.text}),
    [typeFormats.stringFormat.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesSQLite.text}),
    [typeFormats.bigintFormat.name]: (p) => ({builder: blob(p, {mode: 'bigint'}), drizzleType: DrizzleTypesSQLite.blob}),
    [typeFormats.numberFormat.name]: (p, params) => {
        if (isIntegerFormat(params)) return {builder: integer(p), drizzleType: DrizzleTypesSQLite.integer};
        return {builder: real(p), drizzleType: DrizzleTypesSQLite.real};
    },
};

// ============================================================================
// Mapper Class
// ============================================================================

/** SQLite-specific column mapper */
export class SQLiteColumnMapper extends BaseColumnMapper {
    constructor(config?: DrizzleMapperConfig) {
        super(config);
    }

    mapPrimitive(kind: RunTypeKindValue, propName: string): ColumnMapping {
        const factory = sqlitePrimitiveDefaults[kind];
        if (!factory) {
            throw new TypedError({
                type: 'drizzle-column-mapping-failed',
                message: `Cannot map property "${propName}" to SQLite column. TypeScript primitive type "${getRunTypeKindName(kind)}" has no corresponding drizzle column type.`,
            });
        }
        return factory(propName);
    }

    mapFormat(formatName: FormatName, formatParams: Record<string, any> | undefined, propName: string): ColumnMapping {
        const factory = sqliteFormatDefaults[formatName];
        if (!factory) return {builder: text(propName), drizzleType: DrizzleTypesSQLite.text};
        return factory(propName, formatParams, {lengthBuffer: this.lengthBuffer});
    }

    mapArray(propName: string): ColumnMapping {
        return {builder: text(propName, {mode: 'json'}), drizzleType: DrizzleTypesSQLite.text};
    }

    mapObject(propName: string): ColumnMapping {
        return {builder: text(propName, {mode: 'json'}), drizzleType: DrizzleTypesSQLite.text};
    }

    mapDate(propName: string): ColumnMapping {
        return {builder: integer(propName, {mode: 'timestamp'}), drizzleType: DrizzleTypesSQLite.integer};
    }
}
