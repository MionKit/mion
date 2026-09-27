/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The pg authoring helpers beyond columns and tables: indexes, constraints, checks, enums,
// sequences, policies and roles, with drizzle-identical names and call shapes and recorder returns.
// All of them replay 1:1 against the real drizzle functions when the owning table materializes.

import type {
  EntryColumn,
  AnyTable,
  AnyTableRef,
  Column,
  NamedColumn,
  NoProps,
  Only,
  PropsOf,
  RtIndexedColumn,
  RtSql,
} from '@mionjs/drizzle-orm';
import {recordColumn, refColumn, RtEntryRecorder, RtValueRecorder, rtColumnKey, rtValueKey} from '@mionjs/drizzle-orm';
import type {PgColIn, PgEntryBrand, RtIndexEntry, UpdateDeleteAction} from './types.ts';
import type {PgSequence, PgSequenceOptions} from './table.ts';

/** What an index position accepts: a column, a decorated column, or sql. */
export type PgIndexColumn = EntryColumn | RtIndexedColumn | RtSql;

// drizzle's two steps: `on` first, then the index options; an option before `on` does not exist on drizzle's builder.
/** `index(name)` before its columns: only the `on` calls. */
export interface RtIndexBuilderOn {
  on(...columns: [PgIndexColumn, ...PgIndexColumn[]]): RtIndexEntry;
  using(method: string, ...columns: [PgIndexColumn, ...PgIndexColumn[]]): RtIndexEntry;
  onOnly(...columns: [PgIndexColumn, ...PgIndexColumn[]]): RtIndexEntry;
}
export function index(name?: string): RtIndexBuilderOn {
  return new RtEntryRecorder('index', name === undefined ? [] : [name]) as unknown as RtIndexBuilderOn;
}
export function uniqueIndex(name?: string): RtIndexBuilderOn {
  return new RtEntryRecorder('uniqueIndex', name === undefined ? [] : [name]) as unknown as RtIndexBuilderOn;
}

export interface RtUniqueEntry extends PgEntryBrand {
  on(...columns: [EntryColumn, ...EntryColumn[]]): RtUniqueEntry;
  nullsNotDistinct(): RtUniqueEntry;
}
export function unique(name?: string): RtUniqueEntry {
  return new RtEntryRecorder('unique', name === undefined ? [] : [name]) as unknown as RtUniqueEntry;
}

/** foreignKey: this table's columns as `t.key`, another table's as a tableRef(). */
export interface PgForeignKeyConfig {
  name?: string;
  columns: [EntryColumn, ...EntryColumn[]];
  foreignColumns: [EntryColumn, ...EntryColumn[]];
}
export interface RtForeignKeyEntry extends PgEntryBrand {
  onDelete(action: UpdateDeleteAction): RtForeignKeyEntry;
  onUpdate(action: UpdateDeleteAction): RtForeignKeyEntry;
}
export function foreignKey(config: PgForeignKeyConfig): RtForeignKeyEntry {
  const isRef = (column: object): boolean => typeof (column as Partial<AnyTableRef>).table === 'string';
  const foreignColumns = config.foreignColumns.map((column) => (isRef(column) ? refColumn(column) : column));
  return new RtEntryRecorder('foreignKey', [{...config, foreignColumns}]) as unknown as RtForeignKeyEntry;
}

export interface PgPrimaryKeyConfig {
  name?: string;
  columns: [EntryColumn, ...EntryColumn[]];
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
  /** Marks a role that already exists in the database, so drizzle-kit leaves it out of migrations. */
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
/** A policy attached to a table declared elsewhere: in no extraConfig, so nothing materializes it
 *  for you. Export it from the drizzle-kit schema file and call toDrizzle(policy). */
export interface RtLinkedPolicy {
  readonly [rtColumnKey]?: {rtLinkedPolicy: true};
}
export interface RtPolicyEntry extends PgEntryBrand {
  link(table: AnyTable): RtLinkedPolicy;
}
export function pgPolicy(name: string, config?: PgPolicyConfig): RtPolicyEntry {
  return new RtEntryRecorder('pgPolicy', config === undefined ? [name] : [name, config]) as unknown as RtPolicyEntry;
}

// ── pgEnum / pgSequence ──────────────────────────────────────────────────────

type DrizzleWritable<T> = {-readonly [K in keyof T]: T[K]};
type NonArray<T> = T extends readonly unknown[] ? never : T;

/** A recorded pg enum: migrations need the enum itself, so materialize it with toDrizzle. */
export interface PgEnum<T extends readonly [string, ...string[]]> {
  (): Column<'enum', NoProps, T[number]>;
  <N extends string>(columnName: N): NamedColumn<N, Column<'enum', NoProps, T[number]>>;
  <N extends string, const C extends Only<C, PgColIn>>(
    columnName: N,
    props: C
  ): NamedColumn<N, Column<'enum', PropsOf<C>, T[number]>>;
  <const C extends Only<C, PgColIn>>(props: C): Column<'enum', PropsOf<C>, T[number]>;
  readonly enumName: string;
  readonly enumValues: T;
}
/** The object form of a pg enum (drizzle's second overload); data is the union of its VALUES. */
export interface PgEnumObject<E extends Record<string, string>> {
  (): Column<'enum', NoProps, E[keyof E]>;
  <N extends string>(columnName: N): NamedColumn<N, Column<'enum', NoProps, E[keyof E]>>;
  <N extends string, const C extends Only<C, PgColIn>>(
    columnName: N,
    props: C
  ): NamedColumn<N, Column<'enum', PropsOf<C>, E[keyof E]>>;
  <const C extends Only<C, PgColIn>>(props: C): Column<'enum', PropsOf<C>, E[keyof E]>;
  readonly enumName: string;
  readonly enumValues: E[keyof E][];
}

export function pgEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
  enumName: string,
  values: T | DrizzleWritable<T>
): PgEnum<T>;
export function pgEnum<E extends Record<string, string>>(enumName: string, enumObj: NonArray<E>): PgEnumObject<E>;
export function pgEnum(enumName: string, values: readonly string[] | Record<string, string>): unknown {
  return makeEnumFactory(new RtValueRecorder('pgEnum', [enumName, values]), enumName, values);
}

// The recorded values stay as passed (drizzle reads the object form); only the exposed enumValues are normalized.
/** Shared by pgEnum and pgSchema(...).enum. */
export function makeEnumFactory(recorder: RtValueRecorder, enumName: string, values: readonly string[] | Record<string, string>) {
  const factory = (...args: unknown[]) =>
    recordColumn(args, (context, callArgs) =>
      (recorder.toDrizzleValue(context) as (...enumArgs: unknown[]) => unknown)(...callArgs)
    );
  const enumValues = Array.isArray(values) ? values : Object.values(values);
  const handle = Object.assign(factory, {enumName, enumValues});
  (handle as unknown as Record<symbol, unknown>)[rtValueKey] = recorder;
  return handle;
}

export function pgSequence(name: string, options?: PgSequenceOptions): PgSequence {
  const sequence = new RtValueRecorder('pgSequence', options === undefined ? [name] : [name, options]);
  return {seqName: name, [rtValueKey]: sequence} as PgSequence;
}
