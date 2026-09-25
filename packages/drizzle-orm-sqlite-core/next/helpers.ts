/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side helpers whose types name columns: the shipped recorders, typed for the new columns.

import {foreignKey as shippedForeignKey, type RtSqliteForeignKeyEntry} from '../src/helpers.ts';
import type {AnyColumn} from '../../drizzle-orm/next/columns.ts';
import {refColumn, type AnyTableRef} from '../../drizzle-orm/next/table.ts';

/** foreignKey over the side-by-side columns: another table's column is a tableRef(), this table's a `t.key`. */
export interface SqliteForeignKeyConfig {
  name?: string;
  columns: [AnyColumn, ...AnyColumn[]];
  foreignColumns: [AnyColumn | AnyTableRef, ...Array<AnyColumn | AnyTableRef>];
}
export function foreignKey(config: SqliteForeignKeyConfig): RtSqliteForeignKeyEntry {
  const isRef = (column: object): boolean => typeof (column as Partial<AnyTableRef>).table === 'string';
  const foreignColumns = config.foreignColumns.map((column) => (isRef(column) ? refColumn(column) : column));
  return shippedForeignKey({...config, foreignColumns} as never);
}
