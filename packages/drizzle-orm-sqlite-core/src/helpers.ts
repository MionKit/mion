/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The sqlite authoring helpers beyond columns and tables: indexes, constraints and checks, with drizzle-identical
// names and call shapes and recorder returns.

import type {EntryColumn, RtIndexedColumn, RtSql} from '@mionjs/drizzle-orm';
import {RtEntryRecorder} from '@mionjs/drizzle-orm';
import type {RtSqliteIndexEntry, SqliteEntryBrand, UpdateDeleteAction} from './types.ts';

export type SqliteIndexColumn = EntryColumn | RtIndexedColumn | RtSql;

// drizzle's two steps: `on` first, then the index options; an option before `on` does not exist on drizzle's builder.
/** `index(name)` before its columns: only `on`. */
export interface RtSqliteIndexBuilderOn {
  on(...columns: [SqliteIndexColumn, ...SqliteIndexColumn[]]): RtSqliteIndexEntry;
}
export function index(name: string): RtSqliteIndexBuilderOn {
  return new RtEntryRecorder('index', [name]) as unknown as RtSqliteIndexBuilderOn;
}
export function uniqueIndex(name: string): RtSqliteIndexBuilderOn {
  return new RtEntryRecorder('uniqueIndex', [name]) as unknown as RtSqliteIndexBuilderOn;
}

export interface RtSqliteUniqueEntry extends SqliteEntryBrand {
  on(...columns: [EntryColumn, ...EntryColumn[]]): RtSqliteUniqueEntry;
}
export function unique(name?: string): RtSqliteUniqueEntry {
  return new RtEntryRecorder('unique', name === undefined ? [] : [name]) as unknown as RtSqliteUniqueEntry;
}

/** foreignKey: this table's columns as `t.key`, another table's as a tableRef(). */
export interface SqliteForeignKeyConfig {
  name?: string;
  columns: [EntryColumn, ...EntryColumn[]];
  foreignColumns: [EntryColumn, ...EntryColumn[]];
}
export interface RtSqliteForeignKeyEntry extends SqliteEntryBrand {
  onDelete(action: UpdateDeleteAction): RtSqliteForeignKeyEntry;
  onUpdate(action: UpdateDeleteAction): RtSqliteForeignKeyEntry;
}
export function foreignKey(config: SqliteForeignKeyConfig): RtSqliteForeignKeyEntry {
  return new RtEntryRecorder('foreignKey', [config]) as unknown as RtSqliteForeignKeyEntry;
}

export interface SqlitePrimaryKeyEntryConfig {
  name?: string;
  columns: [EntryColumn, ...EntryColumn[]];
}
export type RtSqlitePrimaryKeyEntry = SqliteEntryBrand;
export function primaryKey(config: SqlitePrimaryKeyEntryConfig): RtSqlitePrimaryKeyEntry {
  return new RtEntryRecorder('primaryKey', [config]) as unknown as RtSqlitePrimaryKeyEntry;
}

export type RtSqliteCheckEntry = SqliteEntryBrand;
export function check(name: string, value: RtSql): RtSqliteCheckEntry {
  return new RtEntryRecorder('check', [name, value]) as unknown as RtSqliteCheckEntry;
}
