/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {text, int, boolean, double, bigint, timestamp, date, time, varchar, json, datetime} from 'drizzle-orm/mysql-core';
import {ReflectionKind} from '@deepkit/type';
import {BaseColumnMapper} from './base.mapper';
import type {ColumnMapping} from '../types/common.types';
import {DrizzleMionError, ErrorMessages} from '../core/errors';
import {getMaxLengthFromParams, isIntegerFormat} from '../core/utils';
import {FormatName, FormatNames} from '@mionkit/type-formats';

/** MySQL-specific column mapper */
export class MySQLColumnMapper extends BaseColumnMapper {
    mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping {
        switch (kind) {
            case ReflectionKind.string:
                return {builder: text(propName), drizzleType: 'text'};
            case ReflectionKind.number:
                return {builder: double(propName), drizzleType: 'double'};
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
            // UUID formats - MySQL doesn't have native UUID, use varchar(36)
            case FormatNames.uuid:
                return {builder: varchar(propName, {length: 36}), drizzleType: 'varchar'};

            // Email format
            case FormatNames.email: {
                const maxLength = getMaxLengthFromParams(formatParams) || 254;
                return {builder: varchar(propName, {length: maxLength}), drizzleType: 'varchar'};
            }

            // URL format
            case FormatNames.url:
                return {builder: text(propName), drizzleType: 'text'};

            // Domain format
            case FormatNames.domain: {
                const maxLength = getMaxLengthFromParams(formatParams) || 253;
                return {builder: varchar(propName, {length: maxLength}), drizzleType: 'varchar'};
            }

            // IP format - IPv6 can be up to 45 chars
            case FormatNames.ip:
                return {builder: varchar(propName, {length: 45}), drizzleType: 'varchar'};

            // DateTime format
            case FormatNames.dateTime:
                return {builder: datetime(propName), drizzleType: 'datetime'};

            // Date format
            case FormatNames.date:
                return {builder: date(propName), drizzleType: 'date'};

            // Time format
            case FormatNames.time:
                return {builder: time(propName), drizzleType: 'time'};

            // Number format
            case FormatNames.numberFormat: {
                if (isIntegerFormat(formatParams)) {
                    return {builder: int(propName), drizzleType: 'int'};
                }
                return {builder: double(propName), drizzleType: 'double'};
            }

            // BigInt format
            case FormatNames.bigintFormat:
                return {builder: bigint(propName, {mode: 'bigint'}), drizzleType: 'bigint'};

            // String format with constraints
            case FormatNames.stringFormat: {
                const maxLength = getMaxLengthFromParams(formatParams);
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
        return {builder: json(propName), drizzleType: 'json'};
    }

    mapObject(propName: string): ColumnMapping {
        return {builder: json(propName), drizzleType: 'json'};
    }

    mapDate(propName: string): ColumnMapping {
        return {builder: timestamp(propName), drizzleType: 'timestamp'};
    }
}
