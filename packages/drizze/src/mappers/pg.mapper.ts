/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    text,
    integer,
    boolean,
    doublePrecision,
    bigint,
    timestamp,
    date,
    time,
    uuid,
    jsonb,
    inet,
    varchar,
    char,
} from 'drizzle-orm/pg-core';
import {ReflectionKind} from '@deepkit/type';
import {BaseColumnMapper} from './base.mapper';
import type {ColumnMapping} from '../types/common.types';
import {DrizzleMionError, ErrorMessages} from '../core/errors';
import {getMaxLengthFromParams, getLengthFromParams, isIntegerFormat} from '../core/utils';
import {FormatName, FormatNames} from '@mionkit/type-formats';

/** PostgreSQL-specific column mapper */
export class PGColumnMapper extends BaseColumnMapper {
    mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping {
        switch (kind) {
            case ReflectionKind.string:
                return {builder: text(propName), drizzleType: 'text'};
            case ReflectionKind.number:
                return {builder: doublePrecision(propName), drizzleType: 'doublePrecision'};
            case ReflectionKind.boolean:
                return {builder: boolean(propName), drizzleType: 'boolean'};
            case ReflectionKind.bigint:
                return {builder: bigint(propName, {mode: 'bigint'}), drizzleType: 'bigint'};
            default:
                throw new DrizzleMionError(ErrorMessages.UNSUPPORTED_PRIMITIVE(ReflectionKind[kind]));
        }
    }

    mapFormat(formatName: FormatName, formatParams: Record<string, any> | undefined, propName: string): ColumnMapping {
        switch (formatName) {
            // UUID formats
            case FormatNames.uuid:
                return {builder: uuid(propName), drizzleType: 'uuid'};

            // Email format
            case FormatNames.email: {
                const maxLength = getMaxLengthFromParams(formatParams) || 254;
                return {builder: varchar(propName, {length: maxLength}), drizzleType: 'varchar'};
            }

            // URL format
            case FormatNames.url:
                return {builder: text(propName), drizzleType: 'text'};

            // Domain format
            case FormatNames.domain:
                return {builder: text(propName), drizzleType: 'text'};

            // IP format
            case FormatNames.ip:
                return {builder: inet(propName), drizzleType: 'inet'};

            // DateTime format
            case FormatNames.dateTime:
                return {builder: timestamp(propName), drizzleType: 'timestamp'};

            // Date format
            case FormatNames.date:
                return {builder: date(propName), drizzleType: 'date'};

            // Time format
            case FormatNames.time:
                return {builder: time(propName), drizzleType: 'time'};

            // Number format
            case FormatNames.numberFormat: {
                if (isIntegerFormat(formatParams)) {
                    return {builder: integer(propName), drizzleType: 'integer'};
                }
                return {builder: doublePrecision(propName), drizzleType: 'doublePrecision'};
            }

            // BigInt format
            case FormatNames.bigintFormat:
                return {builder: bigint(propName, {mode: 'bigint'}), drizzleType: 'bigint'};

            // String format with constraints
            case FormatNames.stringFormat: {
                const maxLength = getMaxLengthFromParams(formatParams);
                const exactLength = getLengthFromParams(formatParams);

                if (exactLength) {
                    return {builder: char(propName, {length: exactLength}), drizzleType: 'char'};
                }
                if (maxLength) {
                    return {builder: varchar(propName, {length: maxLength}), drizzleType: 'varchar'};
                }
                return {builder: text(propName), drizzleType: 'text'};
            }

            default:
                // Fall back to text for unknown formats
                return {builder: text(propName), drizzleType: 'text'};
        }
    }

    mapArray(propName: string): ColumnMapping {
        return {builder: jsonb(propName), drizzleType: 'jsonb'};
    }

    mapObject(propName: string): ColumnMapping {
        return {builder: jsonb(propName), drizzleType: 'jsonb'};
    }

    mapDate(propName: string): ColumnMapping {
        return {builder: timestamp(propName), drizzleType: 'timestamp'};
    }
}
