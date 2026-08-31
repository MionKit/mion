/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The insert/select/update model utilities are plain type transforms over the app
// type T, so the compiled validators for them keep FULL format fidelity (maxLength,
// email, integer, ...). This spec pins that, the marker-coverage pair, and the
// shared-function guarantee: two call sites naming the same derived type resolve
// the SAME compiled function object (reference equality), which is what makes a
// route input share its validator with any other consumer of the same type.

import {describe, it, expect} from 'vitest';
import {createHasUnknownKeysFn, createValidateFn, getRunTypeId} from '@mionjs/run-types';
// Note: Must use regular import (not `import type`) for reflection to work
import {UUIDv4, Email, String as Text, Integer} from '@mionjs/run-types/formats';
import type {InsertModel, SelectModel, UpdateModel} from '@mionjs/run-types';

interface User {
  id: UUIDv4;
  email: Email;
  name: Text<{maxLength: 10}>;
  age: Integer;
  bio?: string;
  createdAt: Date;
}

type UserRow = SelectModel<User>;
// id and createdAt get their values from tableConfig defaults; nothing is generated
type NewUser = InsertModel<User, never, 'id' | 'createdAt'>;
// a variant where id is a generated column and can never be sent
type NewUserGeneratedId = InsertModel<User, 'id', 'createdAt'>;
type UserPatch = UpdateModel<User>;

const uuid = '793aff46-42ac-4372-b7fa-c48ba48ed94f' as UUIDv4;
const fullRow = {id: uuid, email: 'ann@example.com', name: 'ann', age: 30, bio: null, createdAt: new Date()};

describe('SelectModel — full row, optional props come back as null', () => {
  const validate = createValidateFn<UserRow>();

  it('accepts a full row and null on previously-optional props', () => {
    expect(validate(fullRow)).toBe(true);
    expect(validate({...fullRow, bio: 'text'})).toBe(true);
  });

  it('every key is required, including the nullable ones', () => {
    const withoutBio: Partial<typeof fullRow> = {...fullRow};
    delete withoutBio.bio;
    expect(validate(withoutBio)).toBe(false);
  });

  it('format params survive into the compiled validator (no runtime guards involved)', () => {
    expect(validate({...fullRow, name: 'x'.repeat(11)})).toBe(false); // maxLength 10
    expect(validate({...fullRow, email: 'not-an-email'})).toBe(false);
    expect(validate({...fullRow, age: 1.5})).toBe(false); // Integer
    expect(validate({...fullRow, id: 'not-a-uuid'})).toBe(false);
  });
});

describe('InsertModel — defaulted keys optional, generated keys gone', () => {
  const validate = createValidateFn<NewUser>();

  it('requires only columns without defaults', () => {
    expect(validate({email: 'ann@example.com', name: 'ann', age: 30})).toBe(true);
    expect(validate({name: 'ann', age: 30})).toBe(false); // email missing
  });

  it('defaulted and optional keys still validate when present', () => {
    expect(validate({email: 'ann@example.com', name: 'ann', age: 30, id: uuid, createdAt: new Date(), bio: 'hi'})).toBe(true);
    expect(validate({email: 'ann@example.com', name: 'ann', age: 30, id: 'nope'})).toBe(false);
  });

  it('a generated key is flagged as unknown when sent', () => {
    const hasUnknownKeys = createHasUnknownKeysFn<NewUserGeneratedId>();
    expect(hasUnknownKeys({email: 'ann@example.com', name: 'ann', age: 30, id: uuid})).toBe(true);
    expect(hasUnknownKeys({email: 'ann@example.com', name: 'ann', age: 30})).toBe(false);
  });
});

describe('UpdateModel — any subset of the insert payload', () => {
  const validate = createValidateFn<UserPatch>();

  it('accepts the empty object and any subset, still typed', () => {
    expect(validate({})).toBe(true);
    expect(validate({name: 'renamed'})).toBe(true);
    expect(validate({name: 'x'.repeat(11)})).toBe(false); // maxLength still enforced
    expect(validate({age: 'nope'})).toBe(false);
  });
});

// CLAUDE.md marker-coverage rule: both getRunTypeId call shapes over a derived model.
describe('marker coverage + shared compiled functions', () => {
  it('static and reflection getRunTypeId shapes resolve the same id', () => {
    const staticId = getRunTypeId<NewUser>();
    const sample: NewUser = {email: 'ann@example.com', name: 'ann', age: 30};
    expect(getRunTypeId(sample)).toBe(staticId);
  });

  it('two call sites naming the same derived type share ONE compiled function object', () => {
    const first = createValidateFn<UserRow>();
    const second = createValidateFn<UserRow>();
    // reference equality, not just equal behavior: same type id, same cache entry
    expect(second).toBe(first);
  });
});
