/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The sqlite half of the table fuzz suites: column kinds over the dialect-free core, the getTableConfig oracle, views.

import {getTableConfig, getViewConfig} from 'drizzle-orm/sqlite-core';
import {
  buildViewColumns,
  specTools,
  type ColumnSpec,
  type SpecDialect,
  type Surface,
  type TableSpec,
} from '../../drizzle-orm/test/tableSpecCore.ts';

export type {ColumnSpec, Surface, TableSpec} from '../../drizzle-orm/test/tableSpecCore.ts';
export {buildTable, FUZZ_PARENT_NAME} from '../../drizzle-orm/test/tableSpecCore.ts';

// ── the random table spec ────────────────────────────────────────────────────
// Kinds and their order are part of every seed: append new kinds, never reorder them.

const sqliteSpecDialect: SpecDialect = {
  brand: 'sqlite',
  tableFn: 'sqliteTable',
  tableType: 'SqliteTable',
  kinds: [
    ({chance, int}) => {
      if (chance(0.3)) return {fn: 'text', args: [{enum: ['a', 'b', 'c']}], mods: []};
      return {
        fn: 'text',
        args: chance(0.5) ? [{length: int(200)}] : [],
        mods: chance(0.3) ? [{method: 'default', args: ['dflt']}] : [],
      };
    },
    () => ({fn: 'int', args: [], mods: []}),
    ({pick}) => ({fn: 'integer', args: [{mode: pick(['number', 'boolean', 'timestamp', 'timestamp_ms'])}], mods: []}),
    () => ({fn: 'real', args: [], mods: []}),
    ({pick}) => ({fn: 'numeric', args: [{mode: pick(['string', 'number', 'bigint'])}], mods: []}),
    ({pick}) => ({fn: 'blob', args: [{mode: pick(['buffer', 'json', 'bigint'])}], mods: []}),
    () => ({fn: 'integer', args: [], mods: [{method: 'primaryKey', args: [{autoIncrement: true}]}]}),
    ({pick}) => ({
      fn: 'text',
      args: [],
      mods: [{method: 'generatedAlwaysAs', args: ['x', {mode: pick(['virtual', 'stored'])}]}],
    }),
  ],
  stringDefaultFns: [],
  intFns: ['int'],
  refFn: 'int',
  indexWhere: true,
  typeNames: {text: 'Text', int: 'Int', integer: 'Integer', real: 'Real', numeric: 'Numeric', blob: 'Blob'},
  typeMods: new Set(['notNull', 'primaryKey', 'default', 'unique', 'generatedAlwaysAs']),
};

export const {
  makeSpec,
  typeRoadReduce,
  renderNextTableType,
  renderTableSingleCall,
  renderTableType,
  syntheticTableGraph,
  syntheticNextTableGraph,
} = specTools(sqliteSpecDialect);

const normalizeValue = (value: unknown): unknown => {
  if (typeof value === 'function') return '<fn>';
  if (value !== null && typeof value === 'object' && 'queryChunks' in (value as object)) return '<sql>';
  return value;
};
const columnName = (column: unknown) => (column as {name: string}).name;

/** What drizzle-kit reads off a sqlite table, with functions and sql chunks reduced to markers. */
export function project(table: unknown) {
  const config = getTableConfig(table as never);
  return {
    name: config.name,
    columns: config.columns.map((column) => {
      const generated = (column as unknown as {generated?: {as: unknown; type: string; mode: string}}).generated;
      return {
        name: column.name,
        columnType: column.columnType,
        sqlType: column.getSQLType(),
        notNull: column.notNull,
        hasDefault: column.hasDefault,
        default: normalizeValue(column.default),
        primary: column.primary,
        autoIncrement: (column as unknown as {autoIncrement?: boolean}).autoIncrement,
        isUnique: (column as unknown as {isUnique: boolean}).isUnique,
        uniqueName: (column as unknown as {uniqueName?: string}).uniqueName,
        enumValues: column.enumValues,
        generated: generated && {as: normalizeValue(generated.as), type: generated.type, mode: generated.mode},
      };
    }),
    indexes: config.indexes.map((idx) => {
      const indexConfig = (idx as unknown as {config: Record<string, unknown>}).config;
      return {
        name: indexConfig.name,
        unique: indexConfig.unique,
        where: normalizeValue(indexConfig.where),
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
    primaryKeys: config.primaryKeys.map((pk) => ({name: pk.getName(), columns: pk.columns.map(columnName)})),
    uniqueConstraints: config.uniqueConstraints.map((constraint) => ({
      name: constraint.name,
      columns: constraint.columns.map(columnName),
    })),
  };
}

/** What drizzle-kit reads off a sqlite view. */
export function projectView(view: unknown) {
  const config = getViewConfig(view as never) as unknown as Record<string, unknown>;
  return {
    name: config.name,
    isExisting: config.isExisting,
    query: config.query === undefined ? undefined : '<sql>',
    columns: Object.entries(config.selectedFields as Record<string, unknown>).map(([key, column]) => ({
      key,
      name: (column as {name: string}).name,
      sqlType: (column as {getSQLType(): string}).getSQLType(),
      notNull: (column as {notNull: boolean}).notNull,
    })),
  };
}

// ── views: the same column kinds, read-only ─────────────────────────────────

export interface ViewSpec {
  /** Fresh column builders: a column can never be shared with a table. */
  columns: ColumnSpec[];
  /** `.existing()` instead of `.as(sql`...`)`. */
  existing: boolean;
}

/** The table's column kinds minus every table-only modifier: a manual view column has its type and notNull. */
export function makeViewSpec(rng: () => number, tableSpec: TableSpec): ViewSpec {
  const chance = (p: number) => rng() < p;
  const columns = tableSpec.columns.slice(0, 1 + Math.floor(rng() * tableSpec.columns.length)).map((column, index) => ({
    key: `v${index}`,
    fn: column.fn,
    args: column.args,
    mods: chance(0.5) ? [{method: 'notNull', args: []}] : [],
  }));
  return {columns, existing: chance(0.3)};
}

export function buildView(surface: Surface, spec: ViewSpec, viewName: string): unknown {
  const columns = buildViewColumns(surface, spec.columns);
  const builder = surface.ns.sqliteView(viewName as never, columns as never) as Record<string, (...a: unknown[]) => unknown>;
  // The query embeds the parent table, so reference resolution runs on every iteration that is not `.existing()`.
  return spec.existing ? builder.existing() : builder.as(surface.sql`select * from ${surface.parent}`);
}
