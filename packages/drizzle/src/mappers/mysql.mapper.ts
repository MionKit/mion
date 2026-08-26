/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  int,
  boolean,
  double,
  bigint,
  timestamp,
  date,
  time,
  varchar,
  json,
  datetime,
  mysqlEnum,
  text,
} from 'drizzle-orm/mysql-core';
import {RunTypeKind} from '@ts-runtypes/core';
import type {RunTypeKindValue} from '@ts-runtypes/core';
import {TypedError} from '@mionjs/core';
import {BaseColumnMapper, unknownFormatError} from './base.mapper.ts';
import {getRunTypeKindName} from '../core/typeTraverser.ts';
import type {ColumnMapping, DrizzleMapperConfig, PrimitiveColumnFactory, FormatColumnFactory} from '../types/common.types.ts';
import {DrizzleTypesMySQL, DEFAULT_VARCHAR_LENGTH, DEFAULT_LENGTH_BUFFER} from '../types/common.types.ts';
import {getMaxLengthFromParams, isIntegerFormat} from '../core/utils.ts';
import {typeFormats} from '@ts-runtypes/core';
import type {FormatName} from '@ts-runtypes/core';

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

/** Default format-to-column mapping for MySQL. The declared Record<FormatName, ...> type
 *  makes the table exhaustive: a format added upstream fails this file's compile until mapped.
 *  Temporal values are stored as ISO strings via drizzle's string modes (drizzle's Date modes
 *  cannot hydrate Temporal instances); ZonedDateTime keeps its zone id only as text. */
const mysqlFormatDefaults: Record<FormatName, FormatColumnFactory> = {
  [typeFormats.uuid.name]: (p) => ({builder: varchar(p, {length: 36}), drizzleType: DrizzleTypesMySQL.varchar}),
  [typeFormats.email.name]: (p, params) => {
    const maxLength = getMaxLengthFromParams(params) || 254;
    return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
  },
  [typeFormats.url.name]: (p, params) => {
    const maxLength = getMaxLengthFromParams(params) || 2048;
    return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
  },
  [typeFormats.domain.name]: (p, params) => {
    const maxLength = getMaxLengthFromParams(params) || 253;
    return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesMySQL.varchar};
  },
  [typeFormats.ip.name]: (p) => ({builder: varchar(p, {length: 45}), drizzleType: DrizzleTypesMySQL.varchar}),
  [typeFormats.dateTime.name]: (p) => ({builder: datetime(p), drizzleType: DrizzleTypesMySQL.datetime}),
  [typeFormats.date.name]: (p) => ({builder: date(p), drizzleType: DrizzleTypesMySQL.date}),
  [typeFormats.time.name]: (p) => ({builder: time(p), drizzleType: DrizzleTypesMySQL.time}),
  [typeFormats.bigintFormat.name]: (p) => ({builder: bigint(p, {mode: 'bigint'}), drizzleType: DrizzleTypesMySQL.bigint}),
  [typeFormats.numberFormat.name]: (p, params) => {
    if (isIntegerFormat(params)) return {builder: int(p), drizzleType: DrizzleTypesMySQL.int};
    return {builder: double(p), drizzleType: DrizzleTypesMySQL.double};
  },
  [typeFormats.stringFormat.name]: (p, params, config) => {
    const buf = config?.lengthBuffer ?? DEFAULT_LENGTH_BUFFER;
    const maxLength = getMaxLengthFromParams(params);
    if (maxLength) return {builder: varchar(p, {length: Math.ceil(maxLength * buf)}), drizzleType: DrizzleTypesMySQL.varchar};
    return {builder: varchar(p, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesMySQL.varchar};
  },
  [typeFormats.nativeDate.name]: (p) => ({builder: timestamp(p), drizzleType: DrizzleTypesMySQL.timestamp}),
  [typeFormats.temporalInstant.name]: (p) => ({
    builder: timestamp(p, {mode: 'string'}),
    drizzleType: DrizzleTypesMySQL.timestamp,
  }),
  [typeFormats.temporalZonedDateTime.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesMySQL.text}),
  [typeFormats.temporalPlainDate.name]: (p) => ({builder: date(p, {mode: 'string'}), drizzleType: DrizzleTypesMySQL.date}),
  [typeFormats.temporalPlainTime.name]: (p) => ({builder: time(p), drizzleType: DrizzleTypesMySQL.time}),
  [typeFormats.temporalPlainDateTime.name]: (p) => ({
    builder: datetime(p, {mode: 'string'}),
    drizzleType: DrizzleTypesMySQL.datetime,
  }),
  [typeFormats.temporalPlainYearMonth.name]: (p) => ({builder: varchar(p, {length: 7}), drizzleType: DrizzleTypesMySQL.varchar}),
  [typeFormats.formattedArray.name]: (p) => ({builder: json(p), drizzleType: DrizzleTypesMySQL.json}),
  [typeFormats.formattedObject.name]: (p) => ({builder: json(p), drizzleType: DrizzleTypesMySQL.json}),
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
    // exhaustive at compile time; a runtime miss means version skew — throw, never a silently-wrong column
    if (!factory) throw unknownFormatError(formatName, propName, 'MySQL');
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

  mapLiteralUnion(values: string[], propName: string): ColumnMapping {
    return {builder: mysqlEnum(propName, values as [string, ...string[]]), drizzleType: DrizzleTypesMySQL.mysqlEnum};
  }
}
