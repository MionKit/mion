/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// SPIKE (docs/maybe/drizzle-column-format-modifier.md): what the proposed
// `.format({...})` column modifier does to the derived models, next to the
// `refineTableType(table, {...})` we ship today.
//
// The type-cost half of this spike lives in
// packages/type-budget/test/formatModifierSpike.compile.test.ts. This half is
// about BEHAVIOUR: where a tightened format actually bites, and what the two
// approaches leave you able to express afterwards.
//
// Delete this suite together with the prototype if the idea is dropped.

import {describe, it, expect} from 'vitest';
import {createValidateFn} from '@ts-runtypes/core';
import {pgTable, varchar, integer, uuid} from './index.ts';
import type {InferInsertModel} from '@mionjs/drizzle-orm';
import {refineTableType} from '@mionjs/drizzle-orm';

const ID = '793aff46-42ac-4372-b7fa-c48ba48ed94f';

// The database's own shape: nothing here is an API rule.
const dbUsers = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
});
// Road 1: the API rules live on a separate view; dbUsers stays untouched.
const apiUsers = refineTableType(dbUsers, {name: {minLength: 10}, age: {min: 18}});
// Road 2: the API rules live on the column, so the table IS the API shape.
const fmtUsers = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', {length: 100}).notNull().format({minLength: 10}),
  age: integer('age').notNull().format({min: 18}),
});

describe('where a tightened format bites', () => {
  const short = {id: ID, name: 'ann', age: 7};

  it('plain TypeScript accepts the short row on BOTH roads', () => {
    // Format brands are optional properties, so a formatted type stays
    // assignable from its plain base. Tightening a column never turns a
    // literal into a compile error.
    const loose: InferInsertModel<typeof dbUsers> = {name: 'ann', age: 7};
    const refined: InferInsertModel<typeof apiUsers> = {name: 'ann', age: 7};
    const formatted: InferInsertModel<typeof fmtUsers> = {name: 'ann', age: 7};
    expect([loose, refined, formatted]).toHaveLength(3);
  });

  it('the compiled validator is the ONLY place they differ', () => {
    expect(apiUsers).toBe(dbUsers); // refineTableType is identity at runtime
    expect(createValidateFn<InferInsertModel<typeof dbUsers>>()(short)).toBe(true);
    expect(createValidateFn<InferInsertModel<typeof apiUsers>>()(short)).toBe(false);
    expect(createValidateFn<InferInsertModel<typeof fmtUsers>>()(short)).toBe(false);
  });
});

describe('one table, two consumers with different rules', () => {
  const short = {id: ID, name: 'ann', age: 7};
  // public signup: name >= 10, age >= 18. admin import: anything goes.
  const publicUsers = refineTableType(dbUsers, {name: {minLength: 10}, age: {min: 18}});
  const adminUsers = refineTableType(dbUsers, {name: {minLength: 1}, age: {min: 0}});
  // Under .format() the strict view IS the table, so the loose one still has
  // to come from refineTableType, widening each param back by hand.
  const fmtAdminUsers = refineTableType(fmtUsers, {name: {minLength: 1}, age: {min: 0}});

  it('refineTableType derives both views from one untouched table', () => {
    expect(publicUsers).toBe(dbUsers);
    expect(adminUsers).toBe(dbUsers);
    expect(createValidateFn<InferInsertModel<typeof publicUsers>>()(short)).toBe(false);
    expect(createValidateFn<InferInsertModel<typeof adminUsers>>()(short)).toBe(true);
  });

  it('.format() still needs refineTableType for the second view', () => {
    expect(fmtAdminUsers).toBe(fmtUsers);
    expect(createValidateFn<InferInsertModel<typeof fmtUsers>>()(short)).toBe(false);
    expect(createValidateFn<InferInsertModel<typeof fmtAdminUsers>>()(short)).toBe(true);
  });
});

describe('adding one more rule six months later', () => {
  // MergeFormat overwrites a key, it never removes one, so a view can only be
  // loosened by naming a neutral value for every param the column carries. A
  // param added later is not in that list, and nothing says so.
  const namePattern = {source: '^[a-z-]+$', mockSamples: ['ann-lee-xx']} as const;
  const legacyRow = {id: ID, name: 'Ann Lee 42', age: 7};

  const strictView = refineTableType(dbUsers, {name: {minLength: 10, pattern: namePattern}, age: {min: 18}});
  const looseView = refineTableType(dbUsers, {name: {minLength: 1}, age: {min: 0}});

  const patternedTable = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', {length: 100}).notNull().format({minLength: 10, pattern: namePattern}),
    age: integer('age').notNull().format({min: 18}),
  });
  // Written before the pattern existed, so it never mentions it.
  const patternedLooseView = refineTableType(patternedTable, {name: {minLength: 1}, age: {min: 0}});

  it('refineTableType: the loose view is unaffected by the new rule', () => {
    expect(strictView).toBe(dbUsers);
    expect(looseView).toBe(dbUsers);
    expect(createValidateFn<InferInsertModel<typeof strictView>>()(legacyRow)).toBe(false);
    expect(createValidateFn<InferInsertModel<typeof looseView>>()(legacyRow)).toBe(true);
  });

  it('.format(): the loose view silently inherits it and starts rejecting', () => {
    expect(patternedLooseView).toBe(patternedTable);
    expect(createValidateFn<InferInsertModel<typeof patternedTable>>()(legacyRow)).toBe(false);
    expect(createValidateFn<InferInsertModel<typeof patternedLooseView>>()(legacyRow)).toBe(false);
  });
});
