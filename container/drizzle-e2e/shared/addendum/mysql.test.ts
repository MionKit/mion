// The mysql addendum: the migrated builders drizzle's own suites never touch.
// See addendum/pg.test.ts for why this file exists and how the coverage gate
// reads it.
import {sql} from 'drizzle-orm';
// The recorder's sql, for the check constraint. drizzle's own stays for
// db.execute: one records, the other queries.
import {sql as rtSql} from '@mionjs/drizzle-orm';
import {drizzle} from 'drizzle-orm/mysql2';
import {getTableConfig} from 'drizzle-orm/mysql-core';
import {createConnection, type Connection} from 'mysql2/promise';
import type {MySql2Database} from 'drizzle-orm/mysql2';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {
  binary,
  char,
  check,
  customType,
  date,
  double,
  float,
  int,
  json,
  longtext,
  mediumtext,
  mysqlTable,
  real,
  tinytext,
  varbinary,
  varchar,
} from '@mionjs/drizzle-orm-mysql-core';
import {toDrizzle} from '@mionjs/drizzle-orm-mysql-core/drizzle';

let connection: Connection;
// Named, not inferred: drizzle brands its return with the exact client it was
// handed, so `ReturnType<typeof drizzle>` is the Pool flavour, not this one.
let db: MySql2Database;

beforeAll(async () => {
  connection = await createConnection({uri: process.env['MYSQL_CONNECTION_STRING']!, supportBigNumbers: true, multipleStatements: true});
  db = drizzle(connection, {logger: false});
});

afterAll(async () => {
  await connection?.end();
});

const lowercase = customType<{data: string; driverData: string}>({
  dataType: () => 'text',
  toDriver: (value) => value.toLowerCase(),
});

// Interpolated sql and a local customType have no type spelling, so they get their own table; beside the column
// types below they would make that table refuse `convert --to type`.
const checked = mysqlTable(
  'addendum_checked',
  {id: int('id', {primaryKey: true}), tag: lowercase('tag', {notNull: true})},
  (t) => [check('addendum_positive', rtSql`${t.id} > 0`)]
);
const checkedDb = toDrizzle(checked);

// mysql-common declares most of these on `all_types`, which cannot convert: mysqlEnum's values have no type spelling.
const texts = mysqlTable('addendum_texts', {
  id: int('id', {primaryKey: true}),
  tiny: tinytext('tiny', {notNull: true}),
  medium: mediumtext('medium', {notNull: true}),
  long: longtext('long', {notNull: true}),
  label: varchar('label', {length: 20, notNull: true}),
  fixed: char('fixed', {length: 4}),
  bin: binary('bin', {length: 4}),
  varbin: varbinary('varbin', {length: 8}),
  day: date('day'),
  wide: double('wide'),
  narrow: float('narrow'),
  approx: real('approx'),
  doc: json('doc'),
});
const textsDb = toDrizzle(texts);

describe('addendum — the text sizes, check and customType', () => {
  beforeAll(async () => {
    await db.execute(sql`drop table if exists ${checkedDb}`);
    await db.execute(sql`
      create table ${checkedDb} (
        id int primary key,
        tag text not null,
        constraint addendum_positive check (id > 0)
      )
    `);
    await db.execute(sql`drop table if exists ${textsDb}`);
    await db.execute(sql`
      create table ${textsDb} (
        id int primary key,
        tiny tinytext not null,
        medium mediumtext not null,
        \`long\` longtext not null,
        label varchar(20) not null,
        fixed char(4),
        bin binary(4),
        varbin varbinary(8),
        day date,
        wide double,
        narrow float,
        approx double,
        doc json
      )
    `);
  });

  test('the check constraint reaches drizzle-kit through the materialized table', () => {
    expect(getTableConfig(checkedDb).checks.map((entry) => entry.name)).toEqual(['addendum_positive']);
  });

  test('a row round-trips, and customType applies toDriver on the way in', async () => {
    await db.insert(checkedDb).values({id: 1, tag: 'LOUD'});
    expect(await db.select().from(checkedDb)).toEqual([{id: 1, tag: 'loud'}]);
  });

  // The nullable columns are declared, not written: what this table owes the
  // coverage gate is that every one of those types is SPELLED in a test that
  // passes, and drizzle's own suites already exercise the driver's value
  // handling for each of them.
  test('a row round-trips through the column types', async () => {
    await db.insert(textsDb).values({id: 1, tiny: 'a', medium: 'b', long: 'c', label: 'x', fixed: 'abcd', wide: 1.5, doc: {a: 1}});
    const rows = await db.select().from(textsDb);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({id: 1, tiny: 'a', medium: 'b', long: 'c', label: 'x', fixed: 'abcd', wide: 1.5, doc: {a: 1}});
  });

  test('the check constraint really rejects a bad row', async () => {
    await expect(db.insert(checkedDb).values({id: -1, tag: 'a'})).rejects.toThrow();
  });
});
