/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Per-dialect behavior of the schemas-from-tables factories: accept full rows,
// reject wrong shapes, accept null on nullable columns, Standard Schema interop,
// and mock rows that satisfy the compiled validator.

import {describe, it, expect} from 'vitest';
import {boolean, integer, pgTable, varchar} from 'drizzle-orm/pg-core';
import {integer as sqliteInteger, sqliteTable, text as sqliteText} from 'drizzle-orm/sqlite-core';
import {double, int, mysqlTable, varchar as mysqlVarchar} from 'drizzle-orm/mysql-core';
import {createSelectSchema} from './createSchemas.ts';

const pgUsers = pgTable('users', {
  id: integer('id').primaryKey(),
  name: varchar('name', {length: 200}).notNull(),
  isActive: boolean('is_active'),
});

const sqliteNotes = sqliteTable('notes', {
  id: sqliteInteger('id').primaryKey(),
  body: sqliteText('body').notNull(),
  label: sqliteText('label'),
  createdAt: sqliteInteger('created_at', {mode: 'timestamp'}).notNull(),
});

const mysqlOrders = mysqlTable('orders', {
  id: int('id').primaryKey(),
  reference: mysqlVarchar('reference', {length: 64}).notNull(),
  total: double('total').notNull(),
});

describe('createSelectSchema — postgres', () => {
  const schema = createSelectSchema(pgUsers);

  it('accepts a full row and null on nullable columns', () => {
    expect(schema.validate({id: 1, name: 'ann', isActive: true})).toBe(true);
    expect(schema.validate({id: 1, name: 'ann', isActive: null})).toBe(true);
  });

  it('rejects wrong types and missing keys', () => {
    expect(schema.validate({id: '1', name: 'ann', isActive: null})).toBe(false);
    expect(schema.validate({id: 1, isActive: null})).toBe(false);
    expect(schema.validate('not a row')).toBe(false);
  });

  it('exposes runType, typeId, and unknown-key fns', () => {
    expect(schema.runType.kind).toBeDefined();
    expect(typeof schema.typeId).toBe('string');
    expect(schema.hasUnknownKeys({id: 1, name: 'ann', isActive: null, extra: 1})).toBe(true);
    expect(schema.hasUnknownKeys({id: 1, name: 'ann', isActive: null})).toBe(false);
  });

  it('~standard adapter round-trips success and failure', () => {
    const standard = schema['~standard'];
    expect(standard.version).toBe(1);
    expect(standard.vendor).toBe('mion-drizzle');
    const good = {id: 1, name: 'ann', isActive: null};
    expect(standard.validate(good)).toEqual({value: good});
    const bad = standard.validate({id: 'x', name: 'ann', isActive: null}) as {issues: {path?: unknown}[]};
    expect(bad.issues.length).toBeGreaterThan(0);
    expect(bad.issues[0].path).toEqual(['id']);
  });
});

describe('createSelectSchema — sqlite', () => {
  const schema = createSelectSchema(sqliteNotes);

  it('accepts a full row (Date column included) and rejects wrong shapes', () => {
    expect(schema.validate({id: 1, body: 'hi', label: null, createdAt: new Date()})).toBe(true);
    expect(schema.validate({id: 1, body: 'hi', label: null, createdAt: 'not a date'})).toBe(false);
    expect(schema.validate({id: 1, body: 42, label: null, createdAt: new Date()})).toBe(false);
  });

  it('mock rows satisfy the compiled validator (seeded)', () => {
    const row = schema.mock({mock: {seed: 42}});
    expect(schema.validate(row)).toBe(true);
    // same seed, same row
    expect(schema.mock({mock: {seed: 42}})).toEqual(row);
  });
});

describe('createSelectSchema — mysql', () => {
  const schema = createSelectSchema(mysqlOrders);

  it('accepts a full row and rejects wrong types', () => {
    expect(schema.validate({id: 1, reference: 'ref-1', total: 9.5})).toBe(true);
    expect(schema.validate({id: 1, reference: 'ref-1', total: 'x'})).toBe(false);
  });

  it('mock rows satisfy the compiled validator', () => {
    expect(schema.validate(schema.mock({mock: {seed: 7}}))).toBe(true);
  });
});
