/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The sqlite authoring helpers beyond columns and tables: indexes, constraints
// and checks — drizzle-identical names and call shapes, recorder returns.

import type {AnyRtColumn, RtIndexedColumn, RtSql} from '@mionjs/drizzle-orm';
import {RtEntryRecorder, rtColumnKey} from '@mionjs/drizzle-orm';
import type {UpdateDeleteAction} from './columns.ts';

/** Common brand of every extraConfig entry. */
export interface SqliteEntryBrand {
  readonly [rtColumnKey]?: {rtEntry: true};
}

export type SqliteIndexColumn = AnyRtColumn | RtIndexedColumn | RtSql;

export interface RtSqliteIndexEntry extends SqliteEntryBrand {
  on(...columns: [SqliteIndexColumn, ...SqliteIndexColumn[]]): RtSqliteIndexEntry;
  where(condition: RtSql): RtSqliteIndexEntry;
}
export function index(name: string): RtSqliteIndexEntry {
  return new RtEntryRecorder('index', [name]) as unknown as RtSqliteIndexEntry;
}
export function uniqueIndex(name: string): RtSqliteIndexEntry {
  return new RtEntryRecorder('uniqueIndex', [name]) as unknown as RtSqliteIndexEntry;
}

export interface RtSqliteUniqueEntry extends SqliteEntryBrand {
  on(...columns: [AnyRtColumn, ...AnyRtColumn[]]): RtSqliteUniqueEntry;
}
export function unique(name?: string): RtSqliteUniqueEntry {
  return new RtEntryRecorder('unique', name === undefined ? [] : [name]) as unknown as RtSqliteUniqueEntry;
}

export interface SQLiteForeignKeyConfig {
  name?: string;
  columns: [AnyRtColumn, ...AnyRtColumn[]];
  foreignColumns: [AnyRtColumn, ...AnyRtColumn[]];
}
export interface RtSqliteForeignKeyEntry extends SqliteEntryBrand {
  onDelete(action: UpdateDeleteAction): RtSqliteForeignKeyEntry;
  onUpdate(action: UpdateDeleteAction): RtSqliteForeignKeyEntry;
}
export function foreignKey(config: SQLiteForeignKeyConfig): RtSqliteForeignKeyEntry {
  return new RtEntryRecorder('foreignKey', [config]) as unknown as RtSqliteForeignKeyEntry;
}

export interface SQLitePrimaryKeyEntryConfig {
  name?: string;
  columns: [AnyRtColumn, ...AnyRtColumn[]];
}
export type RtSqlitePrimaryKeyEntry = SqliteEntryBrand;
export function primaryKey(config: SQLitePrimaryKeyEntryConfig): RtSqlitePrimaryKeyEntry {
  return new RtEntryRecorder('primaryKey', [config]) as unknown as RtSqlitePrimaryKeyEntry;
}

export type RtSqliteCheckEntry = SqliteEntryBrand;
export function check(name: string, value: RtSql): RtSqliteCheckEntry {
  return new RtEntryRecorder('check', [name, value]) as unknown as RtSqliteCheckEntry;
}
