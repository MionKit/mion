// The sqlite addendum: the migrated builders drizzle's own suites never touch.
// See addendum/pg.test.ts for why this file exists and how the coverage gate
// reads it.
import {sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/better-sqlite3';
import {getTableConfig, getViewConfig} from 'drizzle-orm/sqlite-core';
import Database from 'better-sqlite3';
import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {check, customType, integer, sqliteTable, text, uniqueIndex, view} from '@mionjs/drizzle-orm-sqlite-core';
import {toDrizzle} from '@mionjs/drizzle-orm-sqlite-core/drizzle';

let client: Database.Database;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  client = new Database(process.env['SQLITE_DB_PATH']!);
  db = drizzle(client, {logger: false});
});

afterAll(() => {
  client?.close();
});

const lowercase = customType<{data: string; driverData: string}>({
  dataType: () => 'text',
  toDriver: (value) => value.toLowerCase(),
});

const people = sqliteTable(
  'addendum_people',
  {
    id: integer('id').primaryKey(),
    email: text('email').notNull(),
    tag: lowercase('tag').notNull(),
  },
  (t) => [uniqueIndex('addendum_people_email_uidx').on(t.email), check('addendum_people_positive', sql`${t.id} > 0`)]
);
const peopleDb = toDrizzle(people);

// `view` is drizzle's alias of sqliteView; both are migrated, so both need a run.
const adults = view('addendum_adults', {id: integer('id').notNull(), email: text('email').notNull()}).as(
  sql`select id, email from addendum_people`
);
const adultsDb = toDrizzle(adults);

describe('addendum — check, uniqueIndex, customType and the view alias', () => {
  beforeAll(() => {
    db.run(sql`drop view if exists ${adultsDb}`);
    db.run(sql`drop table if exists ${peopleDb}`);
    db.run(sql`
      create table ${peopleDb} (
        id integer primary key,
        email text not null,
        tag text not null,
        constraint addendum_people_positive check (id > 0)
      )
    `);
    db.run(sql`create unique index addendum_people_email_uidx on ${peopleDb} (email)`);
    db.run(sql`create view ${adultsDb} as select id, email from addendum_people`);
  });

  test('the constraints reach drizzle-kit through the materialized table', () => {
    const config = getTableConfig(peopleDb);
    expect(config.checks.map((entry) => entry.name)).toEqual(['addendum_people_positive']);
    expect(config.indexes.map((entry) => entry.config.name)).toEqual(['addendum_people_email_uidx']);
    expect(getViewConfig(adultsDb).name).toBe('addendum_adults');
  });

  test('a row round-trips, and customType applies toDriver on the way in', () => {
    db.insert(peopleDb).values({id: 1, email: 'A@B.com', tag: 'LOUD'}).run();
    expect(db.select().from(peopleDb).all()).toEqual([{id: 1, email: 'A@B.com', tag: 'loud'}]);
  });

  test('the view selects through', () => {
    expect(db.select().from(adultsDb).all()).toEqual([{id: 1, email: 'A@B.com'}]);
  });

  test('the check constraint really rejects a bad row', () => {
    expect(() => db.insert(peopleDb).values({id: -1, email: 'x@y.z', tag: 'a'}).run()).toThrow();
  });

  test('the unique index really rejects a duplicate', () => {
    expect(() => db.insert(peopleDb).values({id: 2, email: 'A@B.com', tag: 'a'}).run()).toThrow();
  });
});
