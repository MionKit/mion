/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Every function RECORDS the call instead of running drizzle. The models, refineTableType, sql and tableRef are NOT
// re-exported: import them from @mionjs/drizzle-orm. Coverage is gated by manifests/pg.manifest.json; the mapping
// rules live in the drizzle-slim-schemas skill.

// The pg column builders and their column types.
export * from './columns.ts';
// The shared types.
export * from './types.ts';

export {pgTable, pgTableCreator, pgSchema, tableFromType} from './table.ts';
export type {
  CheckEntry,
  ForeignKeyEntry,
  IndexEntry,
  PgExtraConfigColumns,
  PgExtraConfigEntry,
  PgExtraConfigFn,
  PgSchema,
  PgSequence,
  PgSequenceOptions,
  PgTable,
  PgTableWithRLS,
  PrimaryKeyEntry,
  UniqueEntry,
  UniqueIndexEntry,
} from './table.ts';

// The pure-types road: the sql and entry carriers are shared with the core package.
export type {ColRef, Sql, TableEntry} from '@mionjs/drizzle-orm';

// Indexes, constraints, checks, enums, sequences, policies, roles.
export {check, foreignKey, index, pgEnum, pgPolicy, pgRole, pgSequence, primaryKey, unique, uniqueIndex} from './helpers.ts';
export type {
  PgEnum,
  PgEnumObject,
  PgForeignKeyConfig,
  PgIndexColumn,
  PgPolicyConfig,
  PgPrimaryKeyConfig,
  PgRole,
  PgRoleConfig,
  RtCheckEntry,
  RtForeignKeyEntry,
  RtIndexBuilderOn,
  RtLinkedPolicy,
  RtPolicyEntry,
  RtPrimaryKeyEntry,
  RtUniqueEntry,
} from './helpers.ts';

// Views, the manual-column form only (the query-builder form stays on drizzle).
export {pgMaterializedView, pgView} from './views.ts';
export type {PgMaterializedViewBuilder, PgView, PgViewBuilder, ViewFromQueryBuilderNotSupported} from './views.ts';

// PgDate doubles as `Date`, the same global-shadowing convention the runtype formats use.
export type {PgDate as Date} from './columns.ts';
