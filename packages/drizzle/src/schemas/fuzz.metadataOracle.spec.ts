/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Seeded property test for the schemas-from-tables lane. The ORACLE is a hand-rolled
// predicate built ONLY from getTableColumns metadata (notNull, dataType, enumValues,
// varchar length), fully independent of the compiled validator. Properties:
//   (a) seeded mock rows always validate, and the oracle agrees;
//   (b) targeted corruptions (drop a key, null a notNull, oversize a varchar,
//       out-of-set enum, wrong primitive) flip validate to false AND the oracle agrees;
//   (c) getErrors points at the corrupted key.
// Deterministic: a fixed base seed drives every draw; a failure names its seed so the
// run replays byte-for-byte.

import {describe, it, expect} from 'vitest';
import {getTableColumns} from 'drizzle-orm';
import type {Column, Table} from 'drizzle-orm';
import {boolean, doublePrecision, integer, jsonb, pgTable, text, varchar} from 'drizzle-orm/pg-core';
import {blob, integer as sqInteger, sqliteTable, text as sqText} from 'drizzle-orm/sqlite-core';
import {
  double,
  int,
  mysqlEnum,
  mysqlTable,
  text as myText,
  timestamp as myTimestamp,
  varchar as myVarchar,
} from 'drizzle-orm/mysql-core';
import {MockRandom} from '@ts-runtypes/core';
import type {DrizzleRunTypeSchema} from './schema.types.ts';
import {createSelectSchema} from './createSchemas.ts';

const BASE_SEED = 20260826;
const ITERATIONS = 20;

// ############# tables (representative shapes per dialect) #############

const pgUsers = pgTable('users', {
  id: integer('id').primaryKey(),
  name: varchar('name', {length: 200}).notNull(),
  isActive: boolean('is_active'),
  score: doublePrecision('score').notNull(),
});

const pgArticles = pgTable('articles', {
  id: integer('id').primaryKey(),
  status: text('status', {enum: ['draft', 'published']}).notNull(),
  title: varchar('title', {length: 120}).notNull(),
  meta: jsonb('meta').$type<{tags: string[]}>().notNull(),
});

const sqNotes = sqliteTable('notes', {
  id: sqInteger('id').primaryKey(),
  body: sqText('body').notNull(),
  label: sqText('label'),
  createdAt: sqInteger('created_at', {mode: 'timestamp'}).notNull(),
});

const sqSettings = sqliteTable('settings', {
  key: sqText('key', {length: 200}).notNull(),
  level: sqText('level', {enum: ['low', 'high']}).notNull(),
  count: sqInteger('count').notNull(),
  big: blob('big', {mode: 'bigint'}).notNull(),
});

const myOrders = mysqlTable('orders', {
  id: int('id').primaryKey(),
  status: mysqlEnum('status', ['new', 'shipped']).notNull(),
  reference: myVarchar('reference', {length: 64}).notNull(),
  total: double('total').notNull(),
});

const myEvents = mysqlTable('events', {
  id: int('id').primaryKey(),
  happenedAt: myTimestamp('happened_at', {mode: 'string'}).notNull(),
  note: myText('note'),
});

// One createSelectSchema CALL SITE per table: markers resolve per call site type.
const targets: {label: string; table: Table; schema: DrizzleRunTypeSchema<any>}[] = [
  {label: 'pg:users', table: pgUsers, schema: createSelectSchema(pgUsers)},
  {label: 'pg:articles', table: pgArticles, schema: createSelectSchema(pgArticles)},
  {label: 'sqlite:notes', table: sqNotes, schema: createSelectSchema(sqNotes)},
  {label: 'sqlite:settings', table: sqSettings, schema: createSelectSchema(sqSettings)},
  {label: 'mysql:orders', table: myOrders, schema: createSelectSchema(myOrders)},
  {label: 'mysql:events', table: myEvents, schema: createSelectSchema(myEvents)},
];

// ############# the metadata-only oracle #############

function columnLength(column: Column): number | undefined {
  const length = 'length' in column ? (column as unknown as {length?: number}).length : undefined;
  return typeof length === 'number' ? length : undefined;
}

/** Row acceptance judged ONLY from column metadata; never touches the compiled fns. */
function oracleAccepts(columns: Record<string, Column>, row: unknown): boolean {
  if (typeof row !== 'object' || row === null) return false;
  const rowRecord = row as Record<string, unknown>;
  for (const [key, column] of Object.entries(columns)) {
    if (!(key in rowRecord) || rowRecord[key] === undefined) return false;
    const value = rowRecord[key];
    if (value === null) {
      if (column.notNull) return false;
      continue;
    }
    if (column.enumValues && !(column.enumValues as string[]).includes(value as string)) return false;
    const maxLength = columnLength(column);
    if (maxLength !== undefined && typeof value === 'string' && value.length > maxLength) return false;
    switch (column.dataType) {
      case 'string':
        if (typeof value !== 'string') return false;
        break;
      case 'number':
        if (typeof value !== 'number') return false;
        break;
      case 'boolean':
        if (typeof value !== 'boolean') return false;
        break;
      case 'bigint':
        if (typeof value !== 'bigint') return false;
        break;
      case 'date':
        if (!(value instanceof Date)) return false;
        break;
      // json: any serializable value; the oracle deliberately does not judge shape
    }
  }
  return true;
}

// ############# corruption catalog (derived from the same metadata) #############

const DROP_KEY = Symbol('drop-key');

interface Corruption {
  kind: string;
  key: string;
  value: unknown;
}

const wrongPrimitiveByDataType: Record<string, unknown> = {
  string: 12345,
  number: 'not a number',
  boolean: 'not a boolean',
  bigint: 'not a bigint',
  date: 'not a date',
};

function corruptionsFor(columns: Record<string, Column>): Corruption[] {
  const catalog: Corruption[] = [];
  for (const [key, column] of Object.entries(columns)) {
    catalog.push({kind: 'drop-key', key, value: DROP_KEY});
    if (column.notNull) catalog.push({kind: 'null-notNull', key, value: null});
    const maxLength = columnLength(column);
    if (maxLength !== undefined) catalog.push({kind: 'oversize-varchar', key, value: 'x'.repeat(maxLength + 1)});
    if (column.enumValues) catalog.push({kind: 'out-of-set-enum', key, value: '__not_a_member__'});
    const wrongValue = wrongPrimitiveByDataType[column.dataType];
    if (wrongValue !== undefined) catalog.push({kind: 'wrong-primitive', key, value: wrongValue});
  }
  return catalog;
}

function applyCorruption(row: Record<string, unknown>, corruption: Corruption): Record<string, unknown> {
  const corrupted = {...row};
  if (corruption.value === DROP_KEY) delete corrupted[corruption.key];
  else corrupted[corruption.key] = corruption.value;
  return corrupted;
}

// ############# properties #############

describe('fuzz — compiled validator vs metadata oracle', () => {
  for (const {label, table, schema} of targets) {
    const columns = getTableColumns(table) as Record<string, Column>;
    const catalog = corruptionsFor(columns);

    it(`${label}: mock rows validate and the oracle agrees`, () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const seed = BASE_SEED + i;
        const row = schema.mock({mock: {seed}});
        expect(schema.validate(row), `${label} seed ${seed}: validate(mock)`).toBe(true);
        expect(oracleAccepts(columns, row), `${label} seed ${seed}: oracle(mock)`).toBe(true);
      }
    });

    it(`${label}: every corruption flips validate AND the oracle, and getErrors names the key`, () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const seed = BASE_SEED + i;
        const random = new MockRandom(seed);
        const corruption = random.pick(catalog);
        const row = schema.mock({mock: {seed}}) as Record<string, unknown>;
        const corrupted = applyCorruption(row, corruption);
        const detail = `${label} seed ${seed} ${corruption.kind}@${corruption.key}`;
        expect(schema.validate(corrupted), `${detail}: validate`).toBe(false);
        expect(oracleAccepts(columns, corrupted), `${detail}: oracle`).toBe(false);
        const errors = schema.getErrors(corrupted);
        expect(
          errors.some((entry) => entry.path.includes(corruption.key)),
          `${detail}: error path`
        ).toBe(true);
      }
    });
  }
});
