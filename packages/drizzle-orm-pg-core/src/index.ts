/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/drizzle-orm-pg-core — the slim pg authoring surface: tables are written as drizzle tables with every
// column setting in ONE props object, and every function RECORDS the call instead of running drizzle. The
// dialect-agnostic surface (InferSelectModel/InferInsertModel/InferUpdateModel, refineTableType, sql, tableRef)
// is NOT re-exported here: import it from @mionjs/drizzle-orm, the required peer. toDrizzle on the './drizzle'
// subpath is the ONE module that imports drizzle-orm, an optional peer.
// Coverage is gated by manifests/pg.manifest.json (`pnpm miondevx core drizzle-manifest --check`);
// the mapping rules live in the drizzle-slim-schemas skill.

// The pg column builders and their column types.
export * from './columns.ts';
// The config, data and modifier-bag types the builders and column types share.
export * from './types.ts';

export {pgTable, pgTableCreator, pgSchema, tableFromType} from './table.ts';
export type {
  AnyPgTable,
  CheckEntry,
  ForeignKeyEntry,
  IndexEntry,
  LiftCols,
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
  PgEntryBrand,
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
  RtIndexEntry,
  RtLinkedPolicy,
  RtPolicyEntry,
  RtPrimaryKeyEntry,
  RtUniqueEntry,
} from './helpers.ts';

// Views, the manual-column form only (the query-builder form stays on drizzle).
export {pgMaterializedView, pgView} from './views.ts';
export type {AnyPgView, PgMaterializedViewBuilder, PgView, PgViewBuilder, ViewFromQueryBuilderNotSupported} from './views.ts';

// PgDate doubles as `Date`, the same global-shadowing convention the runtype formats use.
export type {PgDate as Date} from './columns.ts';
