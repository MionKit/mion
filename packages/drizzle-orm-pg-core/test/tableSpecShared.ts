/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The pg half of the table fuzz suites: column kinds over the dialect-free core, the getTableConfig oracle, views.

import {getMaterializedViewConfig, getTableConfig, getViewConfig} from 'drizzle-orm/pg-core';
import {
  buildViewColumns,
  specTools,
  type ColumnSpec,
  type SpecDialect,
  type Surface,
  type TableSpec,
} from '../../drizzle-orm/test/tableSpecCore.ts';

export type {ColumnSpec, ExtraSpec, ModCall, Surface, TableSpec} from '../../drizzle-orm/test/tableSpecCore.ts';
export {buildTable, FUZZ_PARENT_NAME, renderColumnBuilders, renderEntryType} from '../../drizzle-orm/test/tableSpecCore.ts';

// ── the random table spec ────────────────────────────────────────────────────
// Kinds and their order are part of every seed: never reorder or edit them.

const pgSpecDialect: SpecDialect = {
  brand: 'pg',
  tableFn: 'pgTable',
  tableType: 'PgTable',
  kinds: [
    ({int}) => ({fn: 'varchar', args: [{length: int(200)}], mods: []}),
    ({chance}) => ({fn: 'text', args: chance(0.4) ? [{enum: ['a', 'b', 'c']}] : [], mods: []}),
    () => ({fn: 'integer', args: [], mods: []}),
    () => ({fn: 'smallint', args: [], mods: []}),
    ({chance}) => ({fn: 'boolean', args: [], mods: chance(0.5) ? [{method: 'default', args: [chance(0.5)]}] : []}),
    ({chance}) => ({fn: 'uuid', args: [], mods: chance(0.5) ? [{method: 'defaultRandom', args: []}] : []}),
    ({pick, chance}) => ({
      fn: 'timestamp',
      args: [{mode: pick(['date', 'string'])}],
      mods: chance(0.5) ? [{method: 'defaultNow', args: []}] : [],
    }),
    ({pick, int}) => ({fn: 'numeric', args: [{precision: int(12), scale: int(4), mode: pick(['number', 'string'])}], mods: []}),
    () => ({fn: 'doublePrecision', args: [], mods: []}),
    () => ({fn: 'jsonb', args: [], mods: []}),
    () => ({fn: 'inet', args: [], mods: []}),
    ({pick}) => ({fn: 'bigint', args: [{mode: pick(['number', 'bigint'])}], mods: []}),
    ({pick}) => ({
      fn: 'integer',
      args: [],
      mods: [{method: pick(['generatedAlwaysAsIdentity', 'generatedByDefaultAsIdentity']), args: []}],
    }),
    ({chance, int}) => ({fn: 'text', args: [], mods: [{method: 'array', args: chance(0.5) ? [int(4)] : []}]}),
    () => ({fn: 'text', args: [], mods: [{method: 'generatedAlwaysAs', args: ['x']}]}),
  ],
  stringDefaultFns: ['varchar'],
  intFns: ['integer', 'smallint'],
  refFn: 'integer',
  indexWhere: true,
  typeNames: {
    varchar: 'Varchar',
    text: 'Text',
    integer: 'Integer',
    smallint: 'Smallint',
    boolean: 'Boolean',
    uuid: 'Uuid',
    timestamp: 'Timestamp',
    numeric: 'Numeric',
    doublePrecision: 'DoublePrecision',
    jsonb: 'Jsonb',
    inet: 'Inet',
    bigint: 'Bigint',
  },
  typeMods: new Set([
    'notNull',
    'primaryKey',
    'default',
    'defaultRandom',
    'defaultNow',
    'unique',
    'generatedAlwaysAsIdentity',
    'generatedByDefaultAsIdentity',
    'array',
    'generatedAlwaysAs',
  ]),
};

export const {
  makeSpec,
  typeRoadCovers,
  typeRoadReduce,
  renderColumnType,
  renderNextTableType,
  renderTableBuilders,
  renderTableSingleCall,
  renderTableType,
  syntheticTableGraph,
  syntheticNextTableGraph,
} = specTools(pgSpecDialect);

// ── the oracle: getTableConfig projections must match ────────────────────────

export function project(table: unknown) {
  const config = getTableConfig(table as never);
  const normalizeValue = (value: unknown): unknown => {
    if (typeof value === 'function') return '<fn>';
    if (value !== null && typeof value === 'object' && 'queryChunks' in (value as object)) return '<sql>';
    return value;
  };
  const columnName = (column: unknown) => (column as {name: string}).name;
  return {
    name: config.name,
    schema: config.schema,
    columns: config.columns.map((column) => {
      const extra = column as unknown as {
        uniqueName?: string;
        uniqueType?: string;
        generated?: {as: unknown; type: string};
        generatedIdentity?: {type: string};
      };
      return {
        name: column.name,
        columnType: column.columnType,
        sqlType: column.getSQLType(),
        notNull: column.notNull,
        hasDefault: column.hasDefault,
        default: normalizeValue(column.default),
        primary: column.primary,
        isUnique: column.isUnique,
        uniqueName: extra.uniqueName,
        uniqueType: extra.uniqueType,
        enumValues: column.enumValues,
        generated: extra.generated && {as: normalizeValue(extra.generated.as), type: extra.generated.type},
        identity: extra.generatedIdentity?.type,
      };
    }),
    indexes: config.indexes.map((idx) => {
      const indexConfig = (idx as unknown as {config: Record<string, unknown>}).config;
      return {
        name: indexConfig.name,
        unique: indexConfig.unique,
        where: normalizeValue(indexConfig.where),
        method: indexConfig.method,
        concurrently: indexConfig.concurrently,
        with: indexConfig.with,
        columns: (indexConfig.columns as unknown[]).map(columnName),
      };
    }),
    foreignKeys: config.foreignKeys.map((fk) => {
      const reference = fk.reference();
      return {
        name: fk.getName(),
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
        columns: reference.columns.map(columnName),
        foreignColumns: reference.foreignColumns.map(columnName),
      };
    }),
    checks: config.checks.map((entry) => ({name: entry.name, value: normalizeValue(entry.value)})),
    primaryKeys: config.primaryKeys.map((key) => ({name: key.getName(), columns: key.columns.map(columnName)})),
    uniqueConstraints: config.uniqueConstraints.map((constraint) => ({
      name: constraint.name,
      columns: constraint.columns.map(columnName),
    })),
  };
}

// ── views: the same spec machinery, read-only ────────────────────────────────

export interface ViewSpec {
  /** Fresh column builders: a column can never be shared with a table. */
  columns: ColumnSpec[];
  materialized: boolean;
  /** `.existing()` instead of `.as(sql`...`)`. */
  existing: boolean;
  with?: Record<string, unknown>;
  using?: string;
  tablespace?: string;
  withNoData?: boolean;
}

/** Reuse the table's generated column kinds, minus every modifier that only
 *  means something on a table (defaults, references, identity): a manual view
 *  column carries its type and notNull, nothing else. */
export function makeViewSpec(rng: () => number, tableSpec: TableSpec): ViewSpec {
  const chance = (p: number) => rng() < p;
  const columns = tableSpec.columns.slice(0, 1 + Math.floor(rng() * tableSpec.columns.length)).map((column, index) => ({
    key: `v${index}`,
    fn: column.fn,
    args: column.args,
    mods: chance(0.5) ? [{method: 'notNull', args: []}] : [],
  }));
  const materialized = chance(0.4);
  return {
    columns,
    materialized,
    existing: chance(0.3),
    with: chance(0.4) ? {fillfactor: 90} : undefined,
    using: materialized && chance(0.5) ? 'btree' : undefined,
    tablespace: materialized && chance(0.4) ? 'custom_tablespace' : undefined,
    withNoData: materialized && chance(0.4) ? true : undefined,
  };
}

export function buildView(surface: Surface, spec: ViewSpec, viewName: string): unknown {
  const columns = buildViewColumns(surface, spec.columns);
  const factory = spec.materialized ? 'pgMaterializedView' : 'pgView';
  let builder = surface.ns[factory](viewName as never, columns as never) as Record<string, (...a: unknown[]) => unknown>;
  if (spec.using !== undefined) builder = builder.using(spec.using) as never;
  if (spec.with !== undefined) builder = builder.with(spec.with) as never;
  if (spec.tablespace !== undefined) builder = builder.tablespace(spec.tablespace) as never;
  if (spec.withNoData) builder = builder.withNoData() as never;

  // The query embeds the parent TABLE, so reference resolution is exercised
  // on every iteration that is not `.existing()`.
  return spec.existing ? builder.existing() : builder.as(surface.sql`select * from ${surface.parent}`);
}

/** The view oracle: what drizzle-kit reads plus the selected columns. */
export function projectView(view: unknown, materialized: boolean) {
  const config = (materialized ? getMaterializedViewConfig(view as never) : getViewConfig(view as never)) as unknown as Record<
    string,
    unknown
  >;
  return {
    name: config.name,
    schema: config.schema,
    isExisting: config.isExisting,
    query: config.query === undefined ? undefined : '<sql>',
    with: config.with,
    using: config.using,
    tablespace: config.tablespace,
    withNoData: config.withNoData,
    columns: Object.entries(config.selectedFields as Record<string, unknown>).map(([key, column]) => ({
      key,
      name: (column as {name: string}).name,
      sqlType: (column as {getSQLType(): string}).getSQLType(),
      notNull: (column as {notNull: boolean}).notNull,
    })),
  };
}
