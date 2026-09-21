/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/drizzle-orm-pg-core — the slim pg authoring surface: tables are written exactly as
// drizzle tables, but every function RECORDS the call instead of running drizzle. The
// dialect-agnostic surface (InferSelectModel/InferInsertModel/InferUpdateModel, refineTableType,
// sql) is NOT re-exported here: import it from @mionjs/drizzle-orm, the required peer. toDrizzle
// on the './drizzle' subpath is the ONE module that imports drizzle-orm, an optional peer.
// Coverage is gated by manifests/pg.manifest.json (`pnpm miondevx core drizzle-manifest --check`);
// the mapping rules live in the drizzle-slim-schemas skill.

// The pg column builders, their named data types, and the four kind interfaces.
export * from './columns.ts';

export {pgTable, pgTableCreator, pgSchema, tableFromType} from './table.ts';
export type {
  CheckEntry,
  ForeignKeyEntry,
  IndexEntry,
  AnyPgTable,
  AnyPgView,
  PgExtraConfigColumns,
  PgExtraConfigEntry,
  PgExtraConfigFn,
  PgSchema,
  PgSequence,
  PgSequenceOptions,
  PgTable,
  PrimaryKeyEntry,
  UniqueEntry,
  UniqueIndexEntry,
} from './table.ts';

// The pure-types road: the modifier bags live in ./columns.ts, so only the sql and entry carriers are shared.
export type {ColRef, Sql, TableEntry} from '@mionjs/drizzle-orm';

// Indexes, constraints, checks, enums, sequences, policies, roles.
export * from './helpers.ts';

// Views, the manual-column form only (the query-builder form stays on drizzle).
export {pgMaterializedView, pgView} from './views.ts';
export type {
  PgMaterializedViewBuilder,
  PgSlimView,
  PgViewBuilder,
  PgViewBuilderCore,
  PgViewWithConfig,
  ViewFromQueryBuilderNotSupported,
} from './views.ts';

// PgDate doubles as `Date`, the same global-shadowing convention the runtype formats use.
export type {PgDate as Date} from './columns.ts';
