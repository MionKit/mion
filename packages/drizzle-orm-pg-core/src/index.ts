/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// @mionjs/drizzle-orm-pg-core — the slim pg authoring surface: tables are
// written exactly as drizzle tables (same builder names, same params, same
// modifier chains, same extraConfig and helpers), but every function here
// RECORDS the call instead of running drizzle, and the returned types carry
// only the runtype-format data type plus three flags. The dialect-agnostic
// surface (InferSelectModel/InferInsertModel/InferUpdateModel, refineTableType,
// sql) is NOT re-exported here: consumers import it from @mionjs/drizzle-orm,
// the required peer. The real drizzle table materializes on demand via
// toDrizzle on the './drizzle' subpath — the ONE module that imports
// drizzle-orm, which is an optional peer.
// Coverage is gated by manifests/pg.manifest.json
// (`pnpm rtx core drizzle-manifest --check`); the mapping rules live in the
// drizzle-slim-schemas skill.

// The pg column builders, their named data types, and the four kind interfaces.
export * from './columns.ts';

// The table factories and schema handles.
export {pgTable, pgTableCreator, pgSchema, tableFromType} from './table.ts';
export type {
  CheckEntry,
  ForeignKeyEntry,
  IndexEntry,
  PgBuilderTable,
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

// The pure-types road: the modifier markers applicable to pg columns. The
// column types (Varchar, Uuid, ...) live beside their builders in ./columns.ts.
// ColArray re-exports as `Array` — a builder METHOD's marker, so the naming
// rule (upperFirst) lands on the global-shadowing convention the runtype
// formats already use for String/Number/Date.
export type {
  $Default,
  $DefaultFn,
  $OnUpdate,
  $OnUpdateFn,
  $Type,
  ColArray as Array,
  Default,
  DefaultNow,
  DefaultRandom,
  GeneratedAlwaysAs,
  GeneratedAlwaysAsIdentity,
  GeneratedByDefaultAsIdentity,
  NotNull,
  PrimaryKey,
  References,
  Sql,
  TableEntry,
  Unique,
} from '@mionjs/drizzle-orm';

// Indexes, constraints, checks, enums, sequences, policies, roles.
export * from './helpers.ts';

// Views, the manual-column form only (the query-builder form stays on drizzle).
export {pgMaterializedView, pgView} from './views.ts';
export type {
  PgMaterializedViewBuilder,
  PgViewBuilder,
  PgViewBuilderCore,
  PgViewWithConfig,
  ViewFromQueryBuilderNotSupported,
} from './views.ts';

// The pure-types vocabulary alias for the date column (the other named types
// live beside their builders in ./columns.ts; PgDate doubles as `Date`, the
// same global-shadowing convention the runtype formats use).
export type {PgDate as Date} from './columns.ts';
