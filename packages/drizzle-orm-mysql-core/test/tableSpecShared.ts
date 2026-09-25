/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Shared core of the mysql table suites: the getTableConfig projection oracle every road must match.

import {getTableConfig, getViewConfig} from 'drizzle-orm/mysql-core';

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
    columns: config.columns.map((column) => ({
      name: column.name,
      columnType: column.columnType,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      default: normalizeValue(column.default),
      primary: column.primary,
      isUnique: (column as unknown as {isUnique: boolean}).isUnique,
      enumValues: column.enumValues,
      autoIncrement: (column as unknown as {autoIncrement?: boolean}).autoIncrement,
      hasOnUpdateNow: (column as unknown as {hasOnUpdateNow?: boolean}).hasOnUpdateNow,
    })),
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
