/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql authoring helpers beyond columns and tables: indexes, constraints
// and checks — drizzle-identical names and call shapes, recorder returns.

import type {AnyRtColumn, RtIndexedColumn, RtSql} from '@mionjs/drizzle-orm';
import {RtEntryRecorder, rtColumnKey} from '@mionjs/drizzle-orm';
import type {UpdateDeleteAction} from './columns.ts';

/** Common brand of every extraConfig entry. */
export interface MyEntryBrand {
  readonly [rtColumnKey]?: {rtEntry: true};
}

export type MyIndexColumn = AnyRtColumn | RtIndexedColumn | RtSql;

export interface RtMyIndexEntry extends MyEntryBrand {
  on(...columns: [MyIndexColumn, ...MyIndexColumn[]]): RtMyIndexEntry;
  using(method: 'btree' | 'hash'): RtMyIndexEntry;
  algorithm(algorithm: 'default' | 'inplace' | 'copy'): RtMyIndexEntry;
  lock(lock: 'default' | 'none' | 'shared' | 'exclusive'): RtMyIndexEntry;
}
export function index(name: string): RtMyIndexEntry {
  return new RtEntryRecorder('index', [name]) as unknown as RtMyIndexEntry;
}
export function uniqueIndex(name: string): RtMyIndexEntry {
  return new RtEntryRecorder('uniqueIndex', [name]) as unknown as RtMyIndexEntry;
}

export interface RtMyUniqueEntry extends MyEntryBrand {
  on(...columns: [AnyRtColumn, ...AnyRtColumn[]]): RtMyUniqueEntry;
}
export function unique(name?: string): RtMyUniqueEntry {
  return new RtEntryRecorder('unique', name === undefined ? [] : [name]) as unknown as RtMyUniqueEntry;
}

export interface MySqlForeignKeyConfig {
  name?: string;
  columns: [AnyRtColumn, ...AnyRtColumn[]];
  foreignColumns: [AnyRtColumn, ...AnyRtColumn[]];
}
export interface RtMyForeignKeyEntry extends MyEntryBrand {
  onDelete(action: UpdateDeleteAction): RtMyForeignKeyEntry;
  onUpdate(action: UpdateDeleteAction): RtMyForeignKeyEntry;
}
export function foreignKey(config: MySqlForeignKeyConfig): RtMyForeignKeyEntry {
  return new RtEntryRecorder('foreignKey', [config]) as unknown as RtMyForeignKeyEntry;
}

export interface MySqlPrimaryKeyConfig {
  name?: string;
  columns: [AnyRtColumn, ...AnyRtColumn[]];
}
export type RtMyPrimaryKeyEntry = MyEntryBrand;
export function primaryKey(config: MySqlPrimaryKeyConfig): RtMyPrimaryKeyEntry {
  return new RtEntryRecorder('primaryKey', [config]) as unknown as RtMyPrimaryKeyEntry;
}

export type RtMyCheckEntry = MyEntryBrand;
export function check(name: string, value: RtSql): RtMyCheckEntry {
  return new RtEntryRecorder('check', [name, value]) as unknown as RtMyCheckEntry;
}
