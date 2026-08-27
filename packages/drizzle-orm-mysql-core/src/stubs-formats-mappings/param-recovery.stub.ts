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

import {mysqlTable, int, decimal, mysqlEnum, varchar as myVarchar} from 'drizzle-orm/mysql-core';
import type {MySqlColumn} from 'drizzle-orm/mysql-core';

// ============================================================================
// Assert helpers
// ============================================================================

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
/** The exact empty-object extra config drizzle emits for a param-less column: asserting
 *  Equal<X, Erased> is the "this param was ERASED from the type" proof. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type Erased = {};

type MyCfgOf<C> = C extends MySqlColumn<infer A, any, any> ? A : never;
type MyExtraOf<C> = C extends MySqlColumn<any, any, infer X> ? X : never;

// ============================================================================
// Probe table
// ============================================================================

const my = mysqlTable('m', {
  ui: int('ui', {unsigned: true}),
  amount: decimal('amount', {precision: 10, scale: 2}),
  mood: mysqlEnum('mood', ['x', 'y']),
  vc: myVarchar('vc', {length: 50}),
  ai: int('ai').autoincrement().primaryKey(),
});

// ============================================================================
// RECOVERABLE: literals survive into the built table's type
// ============================================================================

type _mysqlEnumValues = Assert<Equal<MyCfgOf<typeof my.mood>['enumValues'], ['x', 'y']>>;
type _mysqlAutoincrement = Assert<Equal<MyCfgOf<typeof my.ai>['isAutoincrement'], true>>;

// ============================================================================
// NOT RECOVERABLE: the type erases these params (empty extra config, no field)
// ============================================================================

// mysql decimal precision/scale are gone
type _mysqlDecimalLoses = Assert<Equal<MyExtraOf<typeof my.amount>, Erased>>;
// MYSQL loses varchar length where pg/sqlite keep it
type _mysqlVarcharLoses = Assert<Equal<MyExtraOf<typeof my.vc>, Erased>>;
// mysql unsigned leaves no trace (same class as the signed column)
type _mysqlUnsignedLoses = Assert<Equal<MyCfgOf<typeof my.ui>['columnType'], 'MySqlInt'>>;
type _mysqlUnsignedNoExtra = Assert<Equal<MyExtraOf<typeof my.ui>, Erased>>;

// -- Suppress unused warnings ------------------------------------------------
export type _ParamRecoverySpike = [
  _mysqlEnumValues,
  _mysqlAutoincrement,
  _mysqlDecimalLoses,
  _mysqlVarcharLoses,
  _mysqlUnsignedLoses,
  _mysqlUnsignedNoExtra,
];

// tables are consumed via typeof only; reference them so lint sees a value use
void my;
