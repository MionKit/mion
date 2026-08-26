/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
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
  text,
} from 'drizzle-orm/pg-core';
import {RunTypeKind} from '@ts-runtypes/core';
import type {RunTypeKindValue} from '@ts-runtypes/core';
import {TypedError} from '@mionjs/core';
import {BaseColumnMapper, unknownFormatError} from './base.mapper.ts';
import {getRunTypeKindName} from '../core/typeTraverser.ts';
import type {ColumnMapping, DrizzleMapperConfig, PrimitiveColumnFactory, FormatColumnFactory} from '../types/common.types.ts';
import {DrizzleTypesPostgres, DEFAULT_VARCHAR_LENGTH, DEFAULT_LENGTH_BUFFER} from '../types/common.types.ts';
import {getMaxLengthFromParams, getLengthFromParams, isIntegerFormat} from '../core/utils.ts';
import {typeFormats} from '@ts-runtypes/core';
import type {FormatName} from '@ts-runtypes/core';

// ============================================================================
// Default Mapping Objects
// ============================================================================

/** Default primitive-to-column mapping for PostgreSQL, keyed by RunTypeKind */
const pgPrimitiveDefaults: Record<number, PrimitiveColumnFactory> = {
  [RunTypeKind.string]: (p) => ({
    builder: varchar(p, {length: DEFAULT_VARCHAR_LENGTH}),
    drizzleType: DrizzleTypesPostgres.varchar,
  }),
  [RunTypeKind.number]: (p) => ({builder: doublePrecision(p), drizzleType: DrizzleTypesPostgres.doublePrecision}),
  [RunTypeKind.boolean]: (p) => ({builder: boolean(p), drizzleType: DrizzleTypesPostgres.boolean}),
  [RunTypeKind.bigint]: (p) => ({builder: bigint(p, {mode: 'bigint'}), drizzleType: DrizzleTypesPostgres.bigint}),
};

/** Default format-to-column mapping for PostgreSQL. The declared Record<FormatName, ...> type
 *  makes the table exhaustive: a format added upstream fails this file's compile until mapped.
 *  Temporal values are stored as ISO strings via drizzle's string modes (drizzle's Date modes
 *  cannot hydrate Temporal instances); ZonedDateTime keeps its zone id only as text. */
const pgFormatDefaults: Record<FormatName, FormatColumnFactory> = {
  [typeFormats.uuid.name]: (p) => ({builder: uuid(p), drizzleType: DrizzleTypesPostgres.uuid}),
  [typeFormats.email.name]: (p, params) => {
    const maxLength = getMaxLengthFromParams(params) || 254;
    return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesPostgres.varchar};
  },
  [typeFormats.url.name]: (p, params) => {
    const maxLength = getMaxLengthFromParams(params) || 2048;
    return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesPostgres.varchar};
  },
  [typeFormats.domain.name]: (p, params) => {
    const maxLength = getMaxLengthFromParams(params) || 253;
    return {builder: varchar(p, {length: maxLength}), drizzleType: DrizzleTypesPostgres.varchar};
  },
  [typeFormats.ip.name]: (p) => ({builder: inet(p), drizzleType: DrizzleTypesPostgres.inet}),
  [typeFormats.dateTime.name]: (p) => ({builder: timestamp(p), drizzleType: DrizzleTypesPostgres.timestamp}),
  [typeFormats.date.name]: (p) => ({builder: date(p), drizzleType: DrizzleTypesPostgres.date}),
  [typeFormats.time.name]: (p) => ({builder: time(p), drizzleType: DrizzleTypesPostgres.time}),
  [typeFormats.bigintFormat.name]: (p) => ({builder: bigint(p, {mode: 'bigint'}), drizzleType: DrizzleTypesPostgres.bigint}),
  [typeFormats.numberFormat.name]: (p, params) => {
    if (isIntegerFormat(params)) return {builder: integer(p), drizzleType: DrizzleTypesPostgres.integer};
    return {builder: doublePrecision(p), drizzleType: DrizzleTypesPostgres.doublePrecision};
  },
  [typeFormats.stringFormat.name]: (p, params, config) => {
    const buf = config?.lengthBuffer ?? DEFAULT_LENGTH_BUFFER;
    const maxLength = getMaxLengthFromParams(params);
    const exactLength = getLengthFromParams(params);
    if (exactLength) return {builder: varchar(p, {length: exactLength}), drizzleType: DrizzleTypesPostgres.varchar};
    if (maxLength) return {builder: varchar(p, {length: Math.ceil(maxLength * buf)}), drizzleType: DrizzleTypesPostgres.varchar};
    return {builder: varchar(p, {length: DEFAULT_VARCHAR_LENGTH}), drizzleType: DrizzleTypesPostgres.varchar};
  },
  [typeFormats.nativeDate.name]: (p) => ({builder: timestamp(p), drizzleType: DrizzleTypesPostgres.timestamp}),
  [typeFormats.temporalInstant.name]: (p) => ({
    builder: timestamp(p, {withTimezone: true, mode: 'string'}),
    drizzleType: DrizzleTypesPostgres.timestamp,
  }),
  [typeFormats.temporalZonedDateTime.name]: (p) => ({builder: text(p), drizzleType: DrizzleTypesPostgres.text}),
  [typeFormats.temporalPlainDate.name]: (p) => ({builder: date(p, {mode: 'string'}), drizzleType: DrizzleTypesPostgres.date}),
  [typeFormats.temporalPlainTime.name]: (p) => ({builder: time(p), drizzleType: DrizzleTypesPostgres.time}),
  [typeFormats.temporalPlainDateTime.name]: (p) => ({
    builder: timestamp(p, {mode: 'string'}),
    drizzleType: DrizzleTypesPostgres.timestamp,
  }),
  [typeFormats.temporalPlainYearMonth.name]: (p) => ({
    builder: varchar(p, {length: 7}),
    drizzleType: DrizzleTypesPostgres.varchar,
  }),
  [typeFormats.formattedArray.name]: (p) => ({builder: jsonb(p), drizzleType: DrizzleTypesPostgres.jsonb}),
  [typeFormats.formattedObject.name]: (p) => ({builder: jsonb(p), drizzleType: DrizzleTypesPostgres.jsonb}),
};

// ============================================================================
// Mapper Class
// ============================================================================

/** PostgreSQL-specific column mapper */
export class PGColumnMapper extends BaseColumnMapper {
  constructor(config?: DrizzleMapperConfig) {
    super(config);
  }

  mapPrimitive(kind: RunTypeKindValue, propName: string): ColumnMapping {
    const factory = pgPrimitiveDefaults[kind];
    if (!factory) {
      throw new TypedError({
        type: 'drizzle-column-mapping-failed',
        message: `Cannot map property "${propName}" to PostgreSQL column. TypeScript primitive type "${getRunTypeKindName(kind)}" has no corresponding drizzle column type.`,
      });
    }
    return factory(propName);
  }

  mapFormat(formatName: FormatName, formatParams: Record<string, any> | undefined, propName: string): ColumnMapping {
    const factory = pgFormatDefaults[formatName];
    // exhaustive at compile time; a runtime miss means version skew — throw, never a silently-wrong column
    if (!factory) throw unknownFormatError(formatName, propName, 'PostgreSQL');
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

  // NOT auto-pgEnum: a pg enum is a named schema-level object migrations must see; generating
  // one invisibly would break drizzle-kit. Users wanting a real pgEnum pass it via tableConfig.
  mapLiteralUnion(values: string[], propName: string): ColumnMapping {
    return {builder: text(propName, {enum: values as [string, ...string[]]}), drizzleType: DrizzleTypesPostgres.text};
  }
}
