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

import {sqliteTable, text as sqText, integer as sqInt} from 'drizzle-orm/sqlite-core';
import type {SQLiteColumn} from 'drizzle-orm/sqlite-core';

// ============================================================================
// Assert helpers
// ============================================================================

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
type SqCfgOf<C> = C extends SQLiteColumn<infer A, any, any> ? A : never;
type SqExtraOf<C> = C extends SQLiteColumn<any, any, infer X> ? X : never;

// ============================================================================
// Probe table
// ============================================================================

const sq = sqliteTable('s', {
  label: sqText('label', {length: 20, enum: ['p', 'q']}),
  flag: sqInt('flag', {mode: 'boolean'}),
});

// ============================================================================
// RECOVERABLE: literals survive into the built table's type
// ============================================================================

type _sqliteTextLength = Assert<Equal<SqExtraOf<typeof sq.label>, {length: 20}>>;
type _sqliteTextEnum = Assert<Equal<SqCfgOf<typeof sq.label>['enumValues'], ['p', 'q']>>;
// mode is encoded in the columnType class literal
type _sqliteBooleanMode = Assert<Equal<SqCfgOf<typeof sq.flag>['columnType'], 'SQLiteBoolean'>>;

// -- Suppress unused warnings ------------------------------------------------
export type _ParamRecoverySpike = [_sqliteTextLength, _sqliteTextEnum, _sqliteBooleanMode];

// tables are consumed via typeof only; reference them so lint sees a value use
void sq;
