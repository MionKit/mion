/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql half of the table fuzz suites: column kinds over the dialect-free core, the getTableConfig oracle, views.

import {getTableConfig, getViewConfig} from 'drizzle-orm/mysql-core';
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

const mysqlSpecDialect: SpecDialect = {
  brand: 'mysql',
  tableFn: 'mysqlTable',
  tableType: 'MysqlTable',
  kinds: [
    ({int}) => ({fn: 'varchar', args: [{length: int(200)}], mods: []}),
    ({chance}) => ({fn: 'text', args: chance(0.4) ? [{enum: ['a', 'b', 'c']}] : [], mods: []}),
    ({chance}) => ({
      fn: 'int',
      args: chance(0.3) ? [{unsigned: true}] : [],
      mods: chance(0.2) ? [{method: 'autoincrement', args: []}] : [],
    }),
    () => ({fn: 'smallint', args: [], mods: []}),
    ({chance}) => ({fn: 'boolean', args: [], mods: chance(0.5) ? [{method: 'default', args: [chance(0.5)]}] : []}),
    ({pick, chance}) => ({
      fn: 'timestamp',
      args: [{mode: pick(['date', 'string'])}],
      mods: [
        ...(chance(0.5) ? [{method: 'defaultNow', args: []}] : []),
        ...(chance(0.3) ? [{method: 'onUpdateNow', args: []}] : []),
      ],
    }),
    ({int}) => ({fn: 'decimal', args: [{precision: 4 + int(12), scale: int(4)}], mods: []}),
    () => ({fn: 'double', args: [], mods: []}),
    () => ({fn: 'json', args: [], mods: []}),
    ({pick, chance}) => ({fn: 'bigint', args: [{mode: pick(['number', 'bigint']), unsigned: chance(0.3)}], mods: []}),
    () => ({fn: 'serial', args: [], mods: []}),
    ({int}) => ({fn: 'char', args: [{length: int(20)}], mods: []}),
    ({pick}) => ({fn: 'datetime', args: [{mode: pick(['date', 'string'])}], mods: []}),
    () => ({fn: 'tinyint', args: [], mods: []}),
    () => ({fn: 'year', args: [], mods: []}),
    ({pick}) => ({
      fn: 'text',
      args: [],
      mods: [{method: 'generatedAlwaysAs', args: ['x', {mode: pick(['virtual', 'stored'])}]}],
    }),
  ],
  stringDefaultFns: ['varchar', 'char'],
  intFns: ['int', 'smallint'],
  refFn: 'int',
  indexWhere: false,
  typeNames: {
    varchar: 'Varchar',
    text: 'Text',
    int: 'Int',
    smallint: 'Smallint',
    boolean: 'Boolean',
    timestamp: 'Timestamp',
    decimal: 'Decimal',
    double: 'Double',
    json: 'Json',
    bigint: 'Bigint',
    serial: 'Serial',
    char: 'Char',
    datetime: 'Datetime',
    tinyint: 'Tinyint',
    year: 'Year',
  },
  typeMods: new Set([
    'notNull',
    'primaryKey',
    'default',
    'defaultNow',
    'onUpdateNow',
    'autoincrement',
    'unique',
    'generatedAlwaysAs',
  ]),
};

export const {
  makeSpec,
  typeRoadReduce,
  renderNextTableType,
  renderTableSingleCall,
  renderTableType,
  syntheticTableGraph,
  syntheticNextTableGraph,
} = specTools(mysqlSpecDialect);

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
      const generated = (column as unknown as {generated?: {as: unknown; type: string; mode: string}}).generated;
      return {
        name: column.name,
        columnType: column.columnType,
        sqlType: column.getSQLType(),
        notNull: column.notNull,
        hasDefault: column.hasDefault,
        default: normalizeValue(column.default),
        primary: column.primary,
        isUnique: (column as unknown as {isUnique: boolean}).isUnique,
        uniqueName: (column as unknown as {uniqueName?: string}).uniqueName,
        enumValues: column.enumValues,
        autoIncrement: (column as unknown as {autoIncrement?: boolean}).autoIncrement,
        hasOnUpdateNow: (column as unknown as {hasOnUpdateNow?: boolean}).hasOnUpdateNow,
        generated: generated && {as: normalizeValue(generated.as), type: generated.type, mode: generated.mode},
      };
    }),
    indexes: config.indexes.map((idx) => {
      const indexConfig = (idx as unknown as {config: Record<string, unknown>}).config;
      return {
        name: indexConfig.name,
        unique: indexConfig.unique,
        using: indexConfig.using,
        algorithm: indexConfig.algorithm,
        lock: indexConfig.lock,
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

/** The view oracle: what drizzle-kit reads plus the selected columns. */
export function projectView(view: unknown) {
  const config = getViewConfig(view as never) as unknown as Record<string, unknown>;
  return {
    name: config.name,
    schema: config.schema,
    isExisting: config.isExisting,
    query: config.query === undefined ? undefined : '<sql>',
    algorithm: config.algorithm,
    sqlSecurity: config.sqlSecurity,
    withCheckOption: config.withCheckOption,
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
  algorithm?: string;
  sqlSecurity?: string;
  withCheckOption?: string;
}

/** The table's column kinds minus every table-only modifier: a manual view column has its type and notNull. */
export function makeViewSpec(rng: () => number, tableSpec: TableSpec): ViewSpec {
  const chance = (p: number) => rng() < p;
  const pick = <T>(items: T[]): T => items[Math.floor(rng() * items.length)];
  const columns = tableSpec.columns.slice(0, 1 + Math.floor(rng() * tableSpec.columns.length)).map((column, index) => ({
    key: `v${index}`,
    fn: column.fn,
    args: column.args,
    mods: chance(0.5) ? [{method: 'notNull', args: []}] : [],
  }));
  return {
    columns,
    existing: chance(0.3),
    algorithm: chance(0.4) ? pick(['undefined', 'merge', 'temptable']) : undefined,
    sqlSecurity: chance(0.4) ? pick(['definer', 'invoker']) : undefined,
    withCheckOption: chance(0.3) ? pick(['local', 'cascaded']) : undefined,
  };
}

export function buildView(surface: Surface, spec: ViewSpec, viewName: string): unknown {
  const columns = buildViewColumns(surface, spec.columns);
  let builder = surface.ns.mysqlView(viewName as never, columns as never) as Record<string, (...a: unknown[]) => unknown>;
  if (spec.algorithm !== undefined) builder = builder.algorithm(spec.algorithm) as never;
  if (spec.sqlSecurity !== undefined) builder = builder.sqlSecurity(spec.sqlSecurity) as never;
  if (spec.withCheckOption !== undefined) builder = builder.withCheckOption(spec.withCheckOption) as never;
  // The query embeds the parent table, so reference resolution runs on every iteration that is not `.existing()`.
  return spec.existing ? builder.existing() : builder.as(surface.sql`select * from ${surface.parent}`);
}
