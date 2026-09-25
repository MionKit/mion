/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Shared core of the sqlite table suites: the getTableConfig projection oracle every road is compared through.

import {getTableConfig, getViewConfig} from 'drizzle-orm/sqlite-core';

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
