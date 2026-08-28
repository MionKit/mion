/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Property fuzz for the slim pg surface, oracle: compare-to-a-trusted-source.
// One randomly generated table SPEC is interpreted twice over two surfaces
// whose call shapes are identical by design — the slim recorders here and raw
// drizzle-orm/pg-core — and drizzle's own getTableConfig of toDrizzle(slim)
// must equal the raw build's, across random columns, configs, modifier chains,
// references and extraConfig entries. A failing iteration prints its seed and
// the generated spec; re-running with RT_FUZZ_SEED replays it byte-for-byte
// (seeding per the shared harness in packages/ts-runtypes/test/fuzz/core/).

import {describe, it, expect} from 'vitest';
import {getTableConfig} from 'drizzle-orm/pg-core';
import * as dzPg from 'drizzle-orm/pg-core';
import {sql as dzSql} from 'drizzle-orm';
import {mixSeed, mulberry32} from '../../ts-runtypes/test/fuzz/core/seededRng.ts';
import {sql as slimSql} from '@mionjs/drizzle-orm';
import * as slim from './index.ts';
import {toDrizzle} from './drizzle.ts';

const ITERATIONS = 120;
const BASE_SEED = process.env.RT_FUZZ_SEED ? Number(process.env.RT_FUZZ_SEED) : 0x5eed_d12e;

// ── the random table spec ────────────────────────────────────────────────────

interface ModCall {
  method: string;
  args: unknown[];
}
interface ColumnSpec {
  key: string;
  fn: string;
  args: unknown[];
  mods: ModCall[];
  /** () => parent.id reference, realized per surface. */
  referencesParent?: boolean;
}
interface ExtraSpec {
  fn: 'index' | 'uniqueIndex' | 'unique' | 'check' | 'foreignKey';
  name: string;
  onKeys?: string[];
  whereKey?: string;
  checkKey?: string;
  fkKey?: boolean;
}
interface TableSpec {
  columns: ColumnSpec[];
  extras: ExtraSpec[];
}

function makeSpec(rng: () => number): TableSpec {
  const pick = <T>(items: T[]): T => items[Math.floor(rng() * items.length)];
  const chance = (p: number) => rng() < p;
  const int = (max: number) => 1 + Math.floor(rng() * max);

  const kinds: Array<() => Pick<ColumnSpec, 'fn' | 'args' | 'mods'>> = [
    () => ({fn: 'varchar', args: [{length: int(200)}], mods: []}),
    () => ({fn: 'text', args: chance(0.4) ? [{enum: ['a', 'b', 'c']}] : [], mods: []}),
    () => ({fn: 'integer', args: [], mods: []}),
    () => ({fn: 'smallint', args: [], mods: []}),
    () => ({fn: 'boolean', args: [], mods: chance(0.5) ? [{method: 'default', args: [chance(0.5)]}] : []}),
    () => ({fn: 'uuid', args: [], mods: chance(0.5) ? [{method: 'defaultRandom', args: []}] : []}),
    () => ({
      fn: 'timestamp',
      args: [{mode: pick(['date', 'string'])}],
      mods: chance(0.5) ? [{method: 'defaultNow', args: []}] : [],
    }),
    () => ({fn: 'numeric', args: [{precision: int(12), scale: int(4), mode: pick(['number', 'string'])}], mods: []}),
    () => ({fn: 'doublePrecision', args: [], mods: []}),
    () => ({fn: 'jsonb', args: [], mods: []}),
    () => ({fn: 'inet', args: [], mods: []}),
    () => ({fn: 'bigint', args: [{mode: pick(['number', 'bigint'])}], mods: []}),
  ];

  const columns: ColumnSpec[] = [];
  const columnCount = 1 + int(7);
  let hasPrimary = false;
  for (let i = 0; i < columnCount; i++) {
    const base = pick(kinds)();
    const column: ColumnSpec = {key: `col_${i}`, fn: base.fn, args: [`c${i}`, ...base.args], mods: [...base.mods]};
    if (chance(0.5)) column.mods.push({method: 'notNull', args: []});
    if (!hasPrimary && chance(0.15)) {
      column.mods.push({method: 'primaryKey', args: []});
      hasPrimary = true;
    }
    if (chance(0.2)) column.mods.push({method: 'unique', args: [`uq_c${i}`]});
    if (base.fn === 'varchar' && chance(0.3)) column.mods.push({method: 'default', args: ['dflt']});
    if ((base.fn === 'integer' || base.fn === 'smallint') && chance(0.3)) column.mods.push({method: 'default', args: [int(100)]});
    if (base.fn === 'integer' && chance(0.3)) column.referencesParent = true;
    columns.push(column);
  }

  const extras: ExtraSpec[] = [];
  const columnKeys = columns.map((column) => column.key);
  const numericKey = columns.find((column) => column.fn === 'integer' || column.fn === 'smallint')?.key;
  if (chance(0.6)) {
    extras.push({
      fn: pick(['index', 'uniqueIndex']),
      name: `idx_${extras.length}`,
      onKeys: [pick(columnKeys)],
      whereKey: numericKey !== undefined && chance(0.4) ? numericKey : undefined,
    });
  }
  if (chance(0.35)) extras.push({fn: 'unique', name: `uqc_${extras.length}`, onKeys: [pick(columnKeys)]});
  if (numericKey !== undefined && chance(0.4)) extras.push({fn: 'check', name: `chk_${extras.length}`, checkKey: numericKey});
  if (columns.some((column) => column.referencesParent) && chance(0.5)) {
    extras.push({fn: 'foreignKey', name: `fk_${extras.length}`, fkKey: true});
  }
  return {columns, extras};
}

// ── interpret one spec over one surface ──────────────────────────────────────

interface Surface {
  ns: Record<string, (...args: never[]) => unknown>;
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
  table: (name: string, columns: Record<string, unknown>, extra?: (t: Record<string, unknown>) => unknown[]) => unknown;
  parent: Record<string, unknown>;
}

function buildTable(surface: Surface, spec: TableSpec, tableName: string): unknown {
  const columns: Record<string, unknown> = {};
  for (const columnSpec of spec.columns) {
    let column = surface.ns[columnSpec.fn](...(columnSpec.args as never[])) as Record<string, (...a: unknown[]) => unknown>;
    for (const mod of columnSpec.mods) column = mod.method === 'skip' ? column : (column[mod.method](...mod.args) as never);
    if (columnSpec.referencesParent) {
      column = column.references(() => surface.parent.id, {onDelete: 'cascade'}) as never;
    }
    columns[columnSpec.key] = column;
  }
  const extraConfig =
    spec.extras.length === 0
      ? undefined
      : (t: Record<string, unknown>) =>
          spec.extras.map((extra) => {
            if (extra.fn === 'check')
              return surface.ns.check(extra.name as never, surface.sql`${t[extra.checkKey!]} >= 0` as never);
            if (extra.fn === 'foreignKey') {
              const fkColumn = spec.columns.find((column) => column.referencesParent)!;
              return surface.ns.foreignKey({
                name: extra.name,
                columns: [t[fkColumn.key]],
                foreignColumns: [surface.parent.id],
              } as never);
            }
            let entry = surface.ns[extra.fn](extra.name as never) as Record<string, (...a: unknown[]) => unknown>;
            entry = entry.on(...extra.onKeys!.map((key) => t[key])) as never;
            if (extra.whereKey !== undefined && extra.fn !== 'unique') {
              entry = entry.where(surface.sql`${t[extra.whereKey]} > ${5}`) as never;
            }
            return entry;
          });
  return surface.table(tableName, columns, extraConfig as never);
}

// ── the oracle: getTableConfig projections must match ────────────────────────

function project(table: unknown) {
  const config = getTableConfig(table as never);
  const normalizeValue = (value: unknown): unknown => {
    if (typeof value === 'function') return '<fn>';
    if (value !== null && typeof value === 'object' && 'queryChunks' in (value as object)) return '<sql>';
    return value;
  };
  const columnName = (column: unknown) => (column as {name: string}).name;
  return {
    name: config.name,
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
    })),
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
        columns: reference.columns.map(columnName),
        foreignColumns: reference.foreignColumns.map(columnName),
      };
    }),
    checks: config.checks.map((entry) => ({name: entry.name, value: normalizeValue(entry.value)})),
    uniqueConstraints: config.uniqueConstraints.map((constraint) => ({
      name: constraint.name,
      columns: constraint.columns.map(columnName),
    })),
  };
}

// ── the run ──────────────────────────────────────────────────────────────────

const slimSurfaceParent = slim.pgTable('fuzz_parents', {id: slim.integer('id').primaryKey()});
const rawSurfaceParent = dzPg.pgTable('fuzz_parents', {id: dzPg.integer('id').primaryKey()});

const slimSurface: Surface = {
  ns: slim as never,
  sql: slimSql as never,
  table: (name, columns, extra) => slim.pgTable(name as never, columns as never, extra as never),
  parent: slimSurfaceParent as never,
};
const rawSurface: Surface = {
  ns: dzPg as never,
  sql: dzSql as never,
  table: (name, columns, extra) => dzPg.pgTable(name as never, columns as never, extra as never),
  parent: rawSurfaceParent as never,
};

describe('pg slim surface — fuzz: toDrizzle equals raw drizzle for random tables', () => {
  it(`replays ${ITERATIONS} random tables byte-equal (base seed ${BASE_SEED})`, () => {
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const seed = mixSeed(BASE_SEED, 'pg-table-equality', iteration);
      const spec = makeSpec(mulberry32(seed));
      const tableName = `fuzz_${iteration}`;
      const slimTable = buildTable(slimSurface, spec, tableName);
      const rawTable = buildTable(rawSurface, spec, tableName);
      const detail = `iteration ${iteration}, seed ${seed} (set RT_FUZZ_SEED=${BASE_SEED} to replay)\nspec: ${JSON.stringify(spec)}`;
      expect(project(toDrizzle(slimTable as never)), detail).toEqual(project(rawTable));
    }
  });
});
