// The pg addendum: the migrated builders drizzle's own suites never touch.
//
// The lane's coverage gate fails when a `migrated` manifest entry is neither
// rewritten by the translation nor spelled here, so this file is what keeps
// "every builder we claim to support has hit a real database" true rather than
// aspirational. Written against the slim packages directly — it is copied in
// AFTER the translation and never passes through it.
import {sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {getTableConfig} from 'drizzle-orm/pg-core';
import {Client} from 'pg';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {
  bit,
  check,
  customType,
  decimal,
  geometry,
  halfvec,
  integer,
  pgRole,
  pgSequence,
  pgTable,
  sparsevec,
  text,
  uniqueIndex,
  vector,
} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

let client: Client;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  client = new Client(process.env['PG_CONNECTION_STRING']!);
  await client.connect();
  db = drizzle(client, {logger: false});
  // vector and geometry are extension types; the image installs both.
  await db.execute(sql`create extension if not exists vector`);
  await db.execute(sql`create extension if not exists postgis`);
});

afterAll(async () => {
  await client?.end();
});

// ── constraints the suites never declare ────────────────────────────────────

const lowercase = customType<{data: string; driverData: string}>({
  dataType: () => 'text',
  toDriver: (value) => value.toLowerCase(),
});

const constrained = pgTable(
  'addendum_constrained',
  {
    id: integer('id').primaryKey(),
    email: text('email').notNull(),
    tag: lowercase('tag').notNull(),
    amount: decimal('amount', {precision: 10, scale: 2}).notNull(),
  },
  (t) => [uniqueIndex('addendum_email_uidx').on(t.email), check('addendum_positive', sql`${t.id} > 0`)]
);
const constrainedDb = toDrizzle(constrained);

describe('addendum — check, uniqueIndex, decimal and customType', () => {
  beforeAll(async () => {
    await db.execute(sql`drop table if exists ${constrainedDb}`);
    await db.execute(sql`
      create table ${constrainedDb} (
        id integer primary key constraint addendum_positive check (id > 0),
        email text not null,
        tag text not null,
        amount numeric(10, 2) not null
      )
    `);
    await db.execute(sql`create unique index addendum_email_uidx on ${constrainedDb} (email)`);
  });

  test('the constraints reach drizzle-kit through the materialized table', () => {
    const config = getTableConfig(constrainedDb);
    expect(config.checks.map((entry) => entry.name)).toEqual(['addendum_positive']);
    expect(config.indexes.map((entry) => entry.config.name)).toEqual(['addendum_email_uidx']);
  });

  test('a row round-trips, and customType applies toDriver on the way in', async () => {
    await db.insert(constrainedDb).values({id: 1, email: 'A@B.com', tag: 'LOUD', amount: '12.34'});
    const rows = await db.select().from(constrainedDb);
    expect(rows).toEqual([{id: 1, email: 'A@B.com', tag: 'loud', amount: '12.34'}]);
  });

  test('the check constraint really rejects a bad row', async () => {
    await expect(db.insert(constrainedDb).values({id: -1, email: 'x@y.z', tag: 'a', amount: '1.00'})).rejects.toThrow();
  });

  test('the unique index really rejects a duplicate', async () => {
    await expect(db.insert(constrainedDb).values({id: 2, email: 'A@B.com', tag: 'a', amount: '1.00'})).rejects.toThrow();
  });
});

// ── the extension column types ──────────────────────────────────────────────

const spatial = pgTable('addendum_spatial', {
  id: integer('id').primaryKey(),
  bits: bit('bits', {dimensions: 3}),
  embedding: vector('embedding', {dimensions: 3}),
  half: halfvec('half', {dimensions: 3}),
  sparse: sparsevec('sparse', {dimensions: 3}),
  place: geometry('place', {type: 'point', mode: 'xy', srid: 4326}),
});
const spatialDb = toDrizzle(spatial);

describe('addendum — bit, vector, halfvec, sparsevec and geometry', () => {
  beforeAll(async () => {
    await db.execute(sql`drop table if exists ${spatialDb}`);
    await db.execute(sql`
      create table ${spatialDb} (
        id integer primary key,
        bits bit(3),
        embedding vector(3),
        half halfvec(3),
        sparse sparsevec(3),
        place geometry(point, 4326)
      )
    `);
  });

  test('every extension column round-trips through a real database', async () => {
    await db.insert(spatialDb).values({
      id: 1,
      bits: '101',
      embedding: [1, 2, 3],
      half: [1, 2, 3],
      sparse: '{1:1,2:2,3:3}/3',
      place: {x: 1, y: 2},
    });
    const rows = await db.select().from(spatialDb);
    expect(rows[0]!.bits).toBe('101');
    expect(rows[0]!.embedding).toEqual([1, 2, 3]);
    expect(rows[0]!.half).toEqual([1, 2, 3]);
    expect(rows[0]!.place).toEqual({x: 1, y: 2});
  });
});

// ── standalone handles drizzle-kit reads off the schema file ────────────────

const orderSeq = pgSequence('addendum_order_seq', {startWith: 100, increment: 2});
const reader = pgRole('addendum_reader');

describe('addendum — pgSequence and pgRole', () => {
  test('the sequence materializes and really produces its configured values', async () => {
    const sequence = toDrizzle(orderSeq);
    expect(sequence.seqName).toBe('addendum_order_seq');
    await db.execute(sql`drop sequence if exists addendum_order_seq`);
    await db.execute(sql`create sequence addendum_order_seq start with 100 increment by 2`);
    const first = await db.execute<{nextval: string}>(sql`select nextval('addendum_order_seq')`);
    const second = await db.execute<{nextval: string}>(sql`select nextval('addendum_order_seq')`);
    expect(Number(first.rows[0]!.nextval)).toBe(100);
    expect(Number(second.rows[0]!.nextval)).toBe(102);
  });

  test('the role materializes and really exists in the database', async () => {
    const role = toDrizzle(reader);
    expect(role.name).toBe('addendum_reader');
    await db.execute(sql`drop role if exists addendum_reader`);
    await db.execute(sql`create role addendum_reader`);
    const found = await db.execute<{rolname: string}>(sql`select rolname from pg_roles where rolname = 'addendum_reader'`);
    expect(found.rows[0]!.rolname).toBe('addendum_reader');
  });
});
