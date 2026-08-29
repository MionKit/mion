// The pg addendum: the migrated builders drizzle's own suites never touch.
//
// The lane's coverage gate fails when a `migrated` manifest entry is neither
// rewritten by the translation nor spelled here, so this file is what keeps
// "every builder we claim to support has hit a real database" true rather than
// aspirational. Written against the slim packages directly — it is copied in
// AFTER the translation and never passes through it.
import {sql} from 'drizzle-orm';
// The recorder's sql, for the check constraint. drizzle's own stays for
// db.execute: one records, the other queries.
import {sql as rtSql} from '@mionjs/drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {getTableConfig} from 'drizzle-orm/pg-core';
import {Client} from 'pg';
import type {NodePgDatabase} from 'drizzle-orm/node-postgres';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {
  bigint,
  bit,
  check,
  customType,
  decimal,
  doublePrecision,
  geometry,
  halfvec,
  integer,
  json,
  line,
  pgRole,
  pgSequence,
  pgTable,
  point,
  real,
  smallint,
  smallserial,
  sparsevec,
  text,
  uniqueIndex,
  vector,
} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';

let client: Client;
// Named, not inferred: drizzle brands its return with the exact client it was
// handed, so `ReturnType<typeof drizzle>` is the Pool flavour, not this one.
let db: NodePgDatabase;

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

// The two builders-only constructs share a table of their own: an interpolated
// sql template and a column from a local customType both have no type spelling,
// so leaving either on the table below would make it refuse `convert --to type`
// and the columns beside it (decimal above all) would never reach the type road.
const checked = pgTable(
  'addendum_checked',
  {id: integer('id').primaryKey(), tag: lowercase('tag').notNull()},
  (t) => [check('addendum_positive', rtSql`${t.id} > 0`)]
);
const checkedDb = toDrizzle(checked);

const constrained = pgTable(
  'addendum_constrained',
  {
    id: integer('id').primaryKey(),
    email: text('email').notNull(),
    amount: decimal('amount', {precision: 10, scale: 2}).notNull(),
  },
  (t) => [uniqueIndex('addendum_email_uidx').on(t.email)]
);
const constrainedDb = toDrizzle(constrained);

describe('addendum — check, uniqueIndex, decimal and customType', () => {
  beforeAll(async () => {
    await db.execute(sql`drop table if exists ${checkedDb}`);
    await db.execute(sql`
      create table ${checkedDb} (
        id integer primary key constraint addendum_positive check (id > 0),
        tag text not null
      )
    `);
    await db.execute(sql`drop table if exists ${constrainedDb}`);
    await db.execute(sql`
      create table ${constrainedDb} (
        id integer primary key,
        email text not null,
        amount numeric(10, 2) not null
      )
    `);
    await db.execute(sql`create unique index addendum_email_uidx on ${constrainedDb} (email)`);
  });

  test('the constraints reach drizzle-kit through the materialized tables', () => {
    expect(getTableConfig(checkedDb).checks.map((entry) => entry.name)).toEqual(['addendum_positive']);
    expect(getTableConfig(constrainedDb).indexes.map((entry) => entry.config.name)).toEqual(['addendum_email_uidx']);
  });

  test('a row round-trips, and customType applies toDriver on the way in', async () => {
    await db.insert(constrainedDb).values({id: 1, email: 'A@B.com', amount: '12.34'});
    expect(await db.select().from(constrainedDb)).toEqual([{id: 1, email: 'A@B.com', amount: '12.34'}]);
    await db.insert(checkedDb).values({id: 1, tag: 'LOUD'});
    expect(await db.select().from(checkedDb)).toEqual([{id: 1, tag: 'loud'}]);
  });

  test('the check constraint really rejects a bad row', async () => {
    await expect(db.insert(checkedDb).values({id: -1, tag: 'a'})).rejects.toThrow();
  });

  test('the unique index really rejects a duplicate', async () => {
    await expect(db.insert(constrainedDb).values({id: 2, email: 'A@B.com', amount: '1.00'})).rejects.toThrow();
  });
});

// ── the column types drizzle's suites only declare on a table that cannot
// convert ───────────────────────────────────────────────────────────────────
//
// pg-common declares all eight of these on its `all_types` table, and that
// table also carries a column built from a locally declared enum handle, which
// has no type spelling. One refusal there would cost these eight their type
// road coverage entirely, so they get a table of their own that converts.
const numerics = pgTable('addendum_numerics', {
  id: smallserial('id').primaryKey(),
  small: smallint('small'),
  big53: bigint('big53', {mode: 'number'}),
  big64: bigint('big64', {mode: 'bigint'}),
  double: doublePrecision('double'),
  float: real('float'),
  doc: json('doc'),
  seg: line('seg', {mode: 'abc'}),
  spot: point('spot', {mode: 'xy'}),
});
const numericsDb = toDrizzle(numerics);

describe('addendum — the numeric, json and geometric column types', () => {
  beforeAll(async () => {
    await db.execute(sql`drop table if exists ${numericsDb}`);
    await db.execute(sql`
      create table ${numericsDb} (
        id smallserial primary key,
        small smallint,
        big53 bigint,
        big64 bigint,
        double double precision,
        float real,
        doc json,
        seg line,
        spot point
      )
    `);
  });

  test('a row round-trips through every one of them', async () => {
    await db.insert(numericsDb).values({
      small: 7,
      big53: 90071992547409,
      big64: 9007199254740993n,
      double: 1.5,
      float: 2.5,
      doc: {a: 1},
      seg: {a: 1, b: 2, c: 3},
      spot: {x: 1, y: 2},
    });
    const rows = await db.select().from(numericsDb);
    expect(rows).toEqual([
      {
        id: 1,
        small: 7,
        big53: 90071992547409,
        big64: 9007199254740993n,
        double: 1.5,
        float: 2.5,
        doc: {a: 1},
        seg: {a: 1, b: 2, c: 3},
        spot: {x: 1, y: 2},
      },
    ]);
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
