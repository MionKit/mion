// The mysql addendum: the migrated builders drizzle's own suites never touch.
// See addendum/pg.test.ts for why this file exists and how the coverage gate
// reads it.
import {sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/mysql2';
import {getTableConfig} from 'drizzle-orm/mysql-core';
import {createConnection, type Connection} from 'mysql2/promise';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {check, customType, int, longtext, mediumtext, mysqlTable, tinytext, varchar} from '@mionjs/drizzle-orm-mysql-core';
import {toDrizzle} from '@mionjs/drizzle-orm-mysql-core/drizzle';

let connection: Connection;
let db: ReturnType<typeof drizzle>;

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

const texts = mysqlTable(
  'addendum_texts',
  {
    id: int('id').primaryKey(),
    tiny: tinytext('tiny').notNull(),
    medium: mediumtext('medium').notNull(),
    long: longtext('long').notNull(),
    tag: lowercase('tag').notNull(),
    label: varchar('label', {length: 20}).notNull(),
  },
  (t) => [check('addendum_positive', sql`${t.id} > 0`)]
);
const textsDb = toDrizzle(texts);

describe('addendum — the text sizes, check and customType', () => {
  beforeAll(async () => {
    await db.execute(sql`drop table if exists ${textsDb}`);
    await db.execute(sql`
      create table ${textsDb} (
        id int primary key,
        tiny tinytext not null,
        medium mediumtext not null,
        \`long\` longtext not null,
        tag text not null,
        label varchar(20) not null,
        constraint addendum_positive check (id > 0)
      )
    `);
  });

  test('the check constraint reaches drizzle-kit through the materialized table', () => {
    expect(getTableConfig(textsDb).checks.map((entry) => entry.name)).toEqual(['addendum_positive']);
  });

  test('a row round-trips, and customType applies toDriver on the way in', async () => {
    await db.insert(textsDb).values({id: 1, tiny: 'a', medium: 'b', long: 'c', tag: 'LOUD', label: 'x'});
    const rows = await db.select().from(textsDb);
    expect(rows).toEqual([{id: 1, tiny: 'a', medium: 'b', long: 'c', tag: 'loud', label: 'x'}]);
  });

  test('the check constraint really rejects a bad row', async () => {
    await expect(db.insert(textsDb).values({id: -1, tiny: 'a', medium: 'b', long: 'c', tag: 'a', label: 'x'})).rejects.toThrow();
  });
});
