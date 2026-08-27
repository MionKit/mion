/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * TYPE STUB — never executed, only type-checked via tsc --noEmit.
 *
 * SPIKE RESULT, pinned: which drizzle column params survive into the BUILT table's
 * type (and could therefore feed a type-level drizzle-to-runtypes mapping), and
 * which are erased by pgTable/mysqlTable/sqliteTable and exist at runtime only.
 * The probes are split per dialect package; the verdict below is the shared,
 * cross-dialect summary.
 *
 * RECOVERABLE in the type (per column):
 *   - config generic: dataType, columnType (exact class literal, which encodes the
 *     mode: PgTimestampString, SQLiteBoolean, ...), notNull, hasDefault,
 *     hasRuntimeDefault ($defaultFn/$onUpdate), isPrimaryKey, isAutoincrement,
 *     identity ('always' | 'byDefault'), generated ({type: 'always'}),
 *     enumValues (literal tuple for text({enum}) / mysqlEnum / pgEnum)
 *   - extra-config generic (3rd type param): pg varchar/char length, sqlite text
 *     length, pg vector dimensions, pg array baseBuilder, jsonb $type
 *
 * NOT recoverable (type erases them; runtime column objects still carry them):
 *   - numeric/decimal precision + scale (pg AND mysql)
 *   - timestamp/time precision, mysql fsp, pg withTimezone, interval fields
 *   - MYSQL varchar/varbinary length (asymmetric: pg and sqlite keep length!)
 *   - mysql int unsigned (columnType stays 'MySqlInt')
 *   - geometry type/srid
 *   - unique() (no isUnique field exists in the column config type at all)
 *   - references() foreign keys, and every DEFAULT VALUE (only the hasDefault
 *     boolean survives, never the value)
 *
 * Verdict recorded 2026-08-27: a pure type-level drizzle-to-runtypes direction
 * stays lossy even for BASE params (decimal precision, mysql lengths, unsigned),
 * before the semantic gap (Email vs varchar) is even considered.
 */

import {pgTable, varchar, char, text, numeric, timestamp, integer, jsonb, vector} from 'drizzle-orm/pg-core';
import type {PgColumn} from 'drizzle-orm/pg-core';

// ============================================================================
// Assert helpers
// ============================================================================

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
/** The exact empty-object extra config drizzle emits for a param-less column: asserting
 *  Equal<X, Erased> is the "this param was ERASED from the type" proof. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type Erased = {};

type CfgOf<C> = C extends PgColumn<infer A, any, any> ? A : never;
type ExtraOf<C> = C extends PgColumn<any, any, infer X> ? X : never;

// ============================================================================
// Probe table
// ============================================================================

const pg = pgTable('p', {
  vc: varchar('vc', {length: 100}),
  ch: char('ch', {length: 8}),
  status: text('status', {enum: ['a', 'b']}),
  price: numeric('price', {precision: 10, scale: 2, mode: 'number'}),
  at: timestamp('at', {withTimezone: true, precision: 3, mode: 'string'}),
  embedding: vector('embedding', {dimensions: 3}),
  ident: integer('ident').generatedAlwaysAsIdentity(),
  pk: integer('pk').primaryKey(),
  dfn: text('dfn').$defaultFn(() => 'x'),
  unq: text('unq').unique('unq_name'),
  fk: integer('fk').references(() => pg2.id),
  meta: jsonb('meta').$type<{a: number}>(),
});
const pg2 = pgTable('p2', {id: integer('id').primaryKey()});

// ============================================================================
// RECOVERABLE: literals survive into the built table's type
// ============================================================================

type _pgVarcharLength = Assert<Equal<ExtraOf<typeof pg.vc>, {length: 100}>>;
type _pgCharLength = Assert<Equal<ExtraOf<typeof pg.ch>, {length: 8}>>;
type _pgVectorDimensions = Assert<Equal<ExtraOf<typeof pg.embedding>, {dimensions: 3}>>;
type _jsonbDollarType = Assert<Equal<ExtraOf<typeof pg.meta>, {$type: {a: number}}>>;
type _pgTextEnum = Assert<Equal<CfgOf<typeof pg.status>['enumValues'], ['a', 'b']>>;

// mode is encoded in the columnType class literal
type _pgTimestampStringMode = Assert<Equal<CfgOf<typeof pg.at>['columnType'], 'PgTimestampString'>>;
// numeric mode 'number' picks the PgNumericNumber class
type _pgNumericNumberMode = Assert<Equal<CfgOf<typeof pg.price>['columnType'], 'PgNumericNumber'>>;

// constraint flags and identity/generated markers
type _pgIdentityAlways = Assert<Equal<CfgOf<typeof pg.ident>['identity'], 'always'>>;
type _pgPrimaryKey = Assert<Equal<CfgOf<typeof pg.pk>['isPrimaryKey'], true>>;
type _pgPkImpliesNotNull = Assert<Equal<CfgOf<typeof pg.pk>['notNull'], true>>;
type _pgRuntimeDefault = Assert<Equal<CfgOf<typeof pg.dfn>['hasRuntimeDefault'], true>>;
type _pgHasDefault = Assert<Equal<CfgOf<typeof pg.dfn>['hasDefault'], true>>;

// ============================================================================
// NOT RECOVERABLE: the type erases these params (empty extra config, no field)
// ============================================================================

// pg numeric precision/scale are gone
type _pgNumericLoses = Assert<Equal<ExtraOf<typeof pg.price>, Erased>>;
// timestamp precision and withTimezone are gone (class only encodes the string mode)
type _pgTimestampLoses = Assert<Equal<ExtraOf<typeof pg.at>, Erased>>;
// unique() leaves no trace: there is no isUnique field in the config type at all
type _uniqueLoses = Assert<Equal<Extract<keyof CfgOf<typeof pg.unq>, 'isUnique'>, never>>;
// references() leaves no trace on the column type
type _referencesLoses = Assert<Equal<ExtraOf<typeof pg.fk>, Erased>>;

// -- Suppress unused warnings ------------------------------------------------
export type _ParamRecoverySpike = [
  _pgVarcharLength,
  _pgCharLength,
  _pgVectorDimensions,
  _jsonbDollarType,
  _pgTextEnum,
  _pgTimestampStringMode,
  _pgNumericNumberMode,
  _pgIdentityAlways,
  _pgPrimaryKey,
  _pgPkImpliesNotNull,
  _pgRuntimeDefault,
  _pgHasDefault,
  _pgNumericLoses,
  _pgTimestampLoses,
  _uniqueLoses,
  _referencesLoses,
];

// tables are consumed via typeof only; reference them so lint sees a value use
void pg;
