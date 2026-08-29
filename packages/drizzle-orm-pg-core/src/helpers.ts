/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The pg authoring helpers beyond columns and tables: indexes, constraints,
// checks, enums, sequences, policies and roles — drizzle-identical names and
// call shapes, recorder returns. All of them replay 1:1 against the real
// drizzle functions when the owning table (or the handle itself) materializes.

import type {AnyRtColumn, AnyRtTable, RtIndexedColumn, RtSql} from '@mionjs/drizzle-orm';
import {RtEntryRecorder, RtValueRecorder, rtColumnKey, rtValueKey} from '@mionjs/drizzle-orm';
import type {UpdateDeleteAction} from './columns.ts';
import {makeEnumFactory, type PgSequence, type PgSequenceOptions} from './table.ts';

/** Common brand of every extraConfig entry (what the callback's array holds). */
export interface PgEntryBrand {
  readonly [rtColumnKey]?: {rtEntry: true};
}

/** What an index position accepts: a column, a decorated column, or sql. */
export type PgIndexColumn = AnyRtColumn | RtIndexedColumn | RtSql;

export interface RtIndexEntry extends PgEntryBrand {
  on(...columns: [PgIndexColumn, ...PgIndexColumn[]]): RtIndexEntry;
  using(method: string, ...columns: [PgIndexColumn, ...PgIndexColumn[]]): RtIndexEntry;
  onOnly(...columns: [PgIndexColumn, ...PgIndexColumn[]]): RtIndexEntry;
  concurrently(): RtIndexEntry;
  where(condition: RtSql): RtIndexEntry;
  with(config: Record<string, unknown>): RtIndexEntry;
}
export function index(name?: string): RtIndexEntry {
  return new RtEntryRecorder('index', name === undefined ? [] : [name]) as unknown as RtIndexEntry;
}
export function uniqueIndex(name?: string): RtIndexEntry {
  return new RtEntryRecorder('uniqueIndex', name === undefined ? [] : [name]) as unknown as RtIndexEntry;
}

export interface RtUniqueEntry extends PgEntryBrand {
  on(...columns: [AnyRtColumn, ...AnyRtColumn[]]): RtUniqueEntry;
  nullsNotDistinct(): RtUniqueEntry;
}
export function unique(name?: string): RtUniqueEntry {
  return new RtEntryRecorder('unique', name === undefined ? [] : [name]) as unknown as RtUniqueEntry;
}

export interface PgForeignKeyConfig {
  name?: string;
  columns: [AnyRtColumn, ...AnyRtColumn[]];
  foreignColumns: [AnyRtColumn, ...AnyRtColumn[]];
}
export interface RtForeignKeyEntry extends PgEntryBrand {
  onDelete(action: UpdateDeleteAction): RtForeignKeyEntry;
  onUpdate(action: UpdateDeleteAction): RtForeignKeyEntry;
}
export function foreignKey(config: PgForeignKeyConfig): RtForeignKeyEntry {
  return new RtEntryRecorder('foreignKey', [config]) as unknown as RtForeignKeyEntry;
}

export interface PgPrimaryKeyConfig {
  name?: string;
  columns: [AnyRtColumn, ...AnyRtColumn[]];
}
export type RtPrimaryKeyEntry = PgEntryBrand;
export function primaryKey(config: PgPrimaryKeyConfig): RtPrimaryKeyEntry {
  return new RtEntryRecorder('primaryKey', [config]) as unknown as RtPrimaryKeyEntry;
}

export type RtCheckEntry = PgEntryBrand;
export function check(name: string, value: RtSql): RtCheckEntry {
  return new RtEntryRecorder('check', [name, value]) as unknown as RtCheckEntry;
}

/** Opaque handle for a recorded pg role; usable in policy `to` lists. */
export interface PgRole {
  readonly name: string;
  /** Mark a role that already exists in the database, so drizzle-kit leaves it
   *  out of migrations instead of trying to CREATE it. */
  existing(): PgRole;
}
export interface PgRoleConfig {
  createDb?: boolean;
  createRole?: boolean;
  inherit?: boolean;
}
export function pgRole(name: string, config?: PgRoleConfig): PgRole {
  const role = new RtValueRecorder('pgRole', config === undefined ? [name] : [name, config]);
  const handle = {
    name,
    existing: () => {
      role.record('existing', []);
      return handle;
    },
    [rtValueKey]: role,
  };
  return handle as PgRole;
}

export interface PgPolicyConfig {
  as?: 'permissive' | 'restrictive';
  for?: 'all' | 'select' | 'insert' | 'update' | 'delete';
  to?: (PgRole | string)[] | PgRole | string;
  using?: RtSql;
  withCheck?: RtSql;
}
/** A policy attached to a table declared elsewhere. It is NOT in any table's
 *  extraConfig, so nothing materializes it for you: export it from the
 *  drizzle-kit schema file and materialize it with toDrizzle(policy). */
export interface RtLinkedPolicy {
  readonly [rtColumnKey]?: {rtLinkedPolicy: true};
}
export interface RtPolicyEntry extends PgEntryBrand {
  link(table: AnyRtTable): RtLinkedPolicy;
}
export function pgPolicy(name: string, config?: PgPolicyConfig): RtPolicyEntry {
  return new RtEntryRecorder('pgPolicy', config === undefined ? [name] : [name, config]) as unknown as RtPolicyEntry;
}

// ── pgEnum / pgSequence ──────────────────────────────────────────────────────

type Writable<T> = {-readonly [K in keyof T]: T[K]};

/** A recorded pg enum: a factory producing slim enum columns (data typed as
 *  the literal union), plus the name/values drizzle-kit style consumers read.
 *  Materialize the enum itself with toDrizzle (needed for migrations). */
export interface PgEnum<T extends readonly [string, ...string[]]> {
  (columnName?: string): import('./columns.ts').RtPgColumn<T[number], false, false, false>;
  readonly enumName: string;
  readonly enumValues: T;
}

/** The object form of a pg enum (drizzle's second overload): a TypeScript enum
 *  object rather than a tuple. Data is the union of its VALUES. */
export interface PgEnumObject<E extends Record<string, string>> {
  (columnName?: string): import('./columns.ts').RtPgColumn<E[keyof E], false, false, false>;
  readonly enumName: string;
  readonly enumValues: E[keyof E][];
}
type NonArray<T> = T extends readonly unknown[] ? never : T;

export function pgEnum<U extends string, T extends Readonly<[U, ...U[]]>>(enumName: string, values: T | Writable<T>): PgEnum<T>;
export function pgEnum<E extends Record<string, string>>(enumName: string, enumObj: NonArray<E>): PgEnumObject<E>;
export function pgEnum(enumName: string, values: readonly string[] | Record<string, string>) {
  // The RECORDED arg stays exactly what the caller passed (drizzle reads the
  // object form itself); only the exposed enumValues are normalized to values.
  const enumValues = Array.isArray(values) ? (values as readonly string[]) : Object.values(values as Record<string, string>);
  return makeEnumFactory(new RtValueRecorder('pgEnum', [enumName, values]), enumName, enumValues);
}

export function pgSequence(name: string, options?: PgSequenceOptions): PgSequence {
  const sequence = new RtValueRecorder('pgSequence', options === undefined ? [name] : [name, options]);
  return {seqName: name, [rtValueKey]: sequence} as PgSequence;
}
