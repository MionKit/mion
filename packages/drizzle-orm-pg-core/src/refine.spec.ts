/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Runtime pins for refineTableType: a validator compiled from the REFINED model
// enforces the refined bound AND the captured one while the unrefined table's
// validator stays looser, the update model is a real partial that still
// enforces formats on present keys, mock data derived from the refined model
// passes its own validator, refineTableType is identity at runtime, and two call
// sites naming the same refined type share ONE compiled function.

import {describe, it, expect} from 'vitest';
import {createMockDataFn, createValidateFn, getRunTypeId} from '@ts-runtypes/core';
import {pgTable} from 'drizzle-orm/pg-core';
import {integer, varchar} from './index.ts';
import type {InferSelect, InferUpdate} from './index.ts';
import {refineTableType} from './index.ts';

const users = pgTable('users', {
  name: varchar('name', {length: 20}).notNull(),
  age: integer('age').notNull(),
});

const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});

type UserRow = InferSelect<typeof users>;
type ApiUser = InferSelect<typeof apiUsers>;
type ApiUserPatch = InferUpdate<typeof apiUsers>;

const ok = {name: 'x'.repeat(12), age: 30};

describe('refineTableType - the refined model compiles to a stricter validator', () => {
  const validate = createValidateFn<ApiUser>();
  const validatePlain = createValidateFn<UserRow>();

  it('enforces the refined AND the captured bound', () => {
    expect(validate(ok)).toBe(true);
    expect(validate({...ok, name: 'short'})).toBe(false); // refined minLength 10
    expect(validate({...ok, name: 'x'.repeat(21)})).toBe(false); // captured maxLength 20
    expect(validate({...ok, age: 17})).toBe(false); // refined min 18
  });

  it('the unrefined table keeps its own (looser) validator', () => {
    expect(validatePlain({name: 'short', age: 17})).toBe(true);
    expect(validatePlain({name: 'x'.repeat(21), age: 30})).toBe(false);
  });

  it('the update model is a partial that still enforces formats on present keys', () => {
    const validatePatch = createValidateFn<ApiUserPatch>();
    expect(validatePatch({})).toBe(true);
    expect(validatePatch({age: 40})).toBe(true);
    expect(validatePatch({name: 'short'})).toBe(false);
  });

  it('mock data derived from the refined model passes its own validator', () => {
    const mock = createMockDataFn<ApiUser>();
    for (let i = 0; i < 5; i++) expect(validate(mock())).toBe(true);
  });

  it('refineTableType returns the reference-identical table object', () => {
    expect(apiUsers).toBe(users as unknown as typeof apiUsers);
  });
});

// CLAUDE.md marker-coverage rule: both getRunTypeId call shapes over the
// refined model, with hash equivalence between the two forms.
describe('refineTableType - marker coverage + shared compiled functions', () => {
  it('static and reflection getRunTypeId shapes resolve the same id', () => {
    const staticId = getRunTypeId<ApiUser>();
    const row: ApiUser = ok;
    const valueId = getRunTypeId(row);
    expect(staticId).toBe(valueId);
    expect(staticId).not.toBe(getRunTypeId<UserRow>());
  });

  it('two call sites naming the same refined type share ONE compiled function', () => {
    const first = createValidateFn<ApiUser>();
    const second = createValidateFn<ApiUser>();
    expect(first).toBe(second);
  });
});
