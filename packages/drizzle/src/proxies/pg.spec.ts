/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Runtime pins for the @mionjs/drizzle/pg proxy builders: a table declared
// with the wrappers yields an InferSelectModel whose compiled validators
// enforce every captured param (varchar length, Int32 width, uuid, enum
// unions) with no runtime guards, two call sites naming the same row type
// share ONE compiled function object, and the wrappers build byte-identical
// columns to raw drizzle (the stamp is type-only).

import {describe, it, expect} from 'vitest';
import type {InferSelectModel} from 'drizzle-orm';
import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import {varchar as drizzleVarchar, numeric as drizzleNumeric, pgTable as drizzlePgTable} from 'drizzle-orm/pg-core';
// pgTable through the proxy pins the export-star passthrough at runtime
import {integer, numeric, pgTable, text, timestamp, uuid, varchar} from './pg.ts';

const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  codes: varchar('codes', {length: 5}).array().notNull(),
  age: integer('age').notNull(),
  role: text('role', {enum: ['admin', 'user']}).notNull(),
  balance: numeric('balance', {precision: 10, scale: 2, mode: 'number'}).notNull(),
  bio: text('bio'),
  createdAt: timestamp('created_at').notNull(),
});

type UserRow = InferSelectModel<typeof users>;

const fullRow = {
  id: '793aff46-42ac-4372-b7fa-c48ba48ed94f',
  name: 'ann',
  codes: ['a1', 'b2'],
  age: 30,
  role: 'admin',
  balance: 12.5,
  bio: null,
  createdAt: new Date(),
};

describe('pg proxy - captured params reach the compiled validator', () => {
  const validate = createValidateFn<UserRow>();

  it('accepts a valid row (nullable column as null or value)', () => {
    expect(validate(fullRow)).toBe(true);
    expect(validate({...fullRow, bio: 'hi'})).toBe(true);
  });

  it('enforces the captured varchar length at the boundary', () => {
    expect(validate({...fullRow, name: 'x'.repeat(100)})).toBe(true);
    expect(validate({...fullRow, name: 'x'.repeat(101)})).toBe(false);
  });

  it('an .array() column enforces the element format per item', () => {
    expect(validate({...fullRow, codes: ['x'.repeat(5)]})).toBe(true);
    expect(validate({...fullRow, codes: ['ok', 'x'.repeat(6)]})).toBe(false);
    expect(validate({...fullRow, codes: 'not-an-array'})).toBe(false);
  });

  it('enforces uuid, Int32 and numeric-number stamps', () => {
    expect(validate({...fullRow, id: 'not-a-uuid'})).toBe(false);
    expect(validate({...fullRow, age: 1.5})).toBe(false);
    expect(validate({...fullRow, age: 2147483648})).toBe(false); // beyond Int32
    expect(validate({...fullRow, balance: 'nope'})).toBe(false);
  });

  it('an enum column validates as its literal union (drizzle typing untouched)', () => {
    expect(validate({...fullRow, role: 'user'})).toBe(true);
    expect(validate({...fullRow, role: 'other'})).toBe(false);
  });
});

// CLAUDE.md marker-coverage rule: both getRunTypeId call shapes over the row.
describe('pg proxy - marker coverage + shared compiled functions', () => {
  it('static and reflection getRunTypeId shapes resolve the same id', () => {
    const staticId = getRunTypeId<UserRow>();
    const sample: UserRow = {...fullRow, role: 'admin'};
    expect(getRunTypeId(sample)).toBe(staticId);
  });

  it('two call sites naming the same row type share ONE compiled function object', () => {
    const first = createValidateFn<UserRow>();
    const second = createValidateFn<UserRow>();
    expect(second).toBe(first);
  });
});

describe('pg proxy - wrappers build the exact drizzle column (stamp is type-only)', () => {
  const rawUsers = drizzlePgTable('users', {
    name: drizzleVarchar('name', {length: 100}).notNull(),
    balance: drizzleNumeric('balance', {precision: 10, scale: 2, mode: 'number'}).notNull(),
  });

  it('proxy columns match raw drizzle columns config-for-config', () => {
    expect(users.name.columnType).toBe(rawUsers.name.columnType);
    expect(users.name.getSQLType()).toBe(rawUsers.name.getSQLType());
    expect(users.name.length).toBe(100);
    expect(users.balance.columnType).toBe(rawUsers.balance.columnType);
    expect(users.balance.getSQLType()).toBe(rawUsers.balance.getSQLType());
    expect(users.name.notNull).toBe(true);
  });
});
