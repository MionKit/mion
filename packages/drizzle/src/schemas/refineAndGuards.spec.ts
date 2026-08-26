/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Column guards (metadata only the table knows, e.g. varchar length) and user
// refinements: pass/fail behavior, error entry shapes, null/undefined skipping,
// and enum-carrying columns rejecting out-of-set values.

import {describe, it, expect} from 'vitest';
import {integer, pgEnum, pgTable, text, varchar} from 'drizzle-orm/pg-core';
import {createEnumSchema, createSelectSchema} from './createSchemas.ts';

const moodEnum = pgEnum('mood', ['happy', 'sad', 'ok']);

const profiles = pgTable('profiles', {
  id: integer('id').primaryKey(),
  handle: varchar('handle', {length: 10}).notNull(),
  bio: text('bio'),
  status: text('status', {enum: ['active', 'banned']}).notNull(),
  mood: moodEnum('mood').notNull(),
  age: integer('age'),
});

const goodRow = {id: 1, handle: 'short', bio: null, status: 'active', mood: 'happy', age: null};

describe('column guards — varchar length', () => {
  const schema = createSelectSchema(profiles);

  it('passes at the limit, fails past it', () => {
    expect(schema.validate({...goodRow, handle: 'x'.repeat(10)})).toBe(true);
    expect(schema.validate({...goodRow, handle: 'x'.repeat(11)})).toBe(false);
  });

  it('emits a stringFormat-shaped error entry with the column path', () => {
    const errors = schema.getErrors({...goodRow, handle: 'x'.repeat(11)});
    expect(errors).toEqual([
      {path: ['handle'], expected: 'stringFormat', format: {name: 'stringFormat', val: 10, formatPath: ['maxLength']}},
    ]);
  });

  it('guards skip null values (nullability belongs to the compiled validator)', () => {
    // bio is text (no length), age nullable: null passes with no guard involvement
    expect(schema.validate(goodRow)).toBe(true);
  });
});

describe('enum-carrying columns — compiled validator enforces membership, no guard needed', () => {
  const schema = createSelectSchema(profiles);

  it('rejects out-of-set values on text({enum}) and pgEnum columns', () => {
    expect(schema.validate({...goodRow, status: 'other'})).toBe(false);
    expect(schema.validate({...goodRow, mood: 'angry'})).toBe(false);
    const errors = schema.getErrors({...goodRow, mood: 'angry'});
    expect(errors.some((entry) => entry.path.includes('mood'))).toBe(true);
  });
});

describe('refine', () => {
  it('boolean form fails with a refine error entry on the column path', () => {
    const schema = createSelectSchema(profiles, {age: (value) => value >= 18});
    expect(schema.validate({...goodRow, age: 30})).toBe(true);
    expect(schema.validate({...goodRow, age: 12})).toBe(false);
    const errors = schema.getErrors({...goodRow, age: 12});
    expect(errors).toEqual([{path: ['age'], expected: 'refine', format: {name: 'refine', val: 'age', formatPath: ['refine']}}]);
  });

  it('string form carries the custom message in the error entry', () => {
    const schema = createSelectSchema(profiles, {age: (value) => value >= 18 || 'must be an adult'});
    const errors = schema.getErrors({...goodRow, age: 12});
    expect(errors[0].format?.val).toBe('must be an adult');
  });

  it('is skipped on null/undefined values', () => {
    const schema = createSelectSchema(profiles, {age: () => false});
    // age is null in goodRow: the always-failing refine never runs
    expect(schema.validate(goodRow)).toBe(true);
  });

  it('runs only after the compiled validator passed', () => {
    const schema = createSelectSchema(profiles, {age: () => false});
    // base validation fails first; refine adds nothing on top of a broken row
    expect(schema.validate({...goodRow, id: 'nope', age: 30})).toBe(false);
  });
});

describe('createEnumSchema', () => {
  const schema = createEnumSchema(moodEnum);

  it('validates membership and exposes the runType', () => {
    expect(schema.validate('ok')).toBe(true);
    expect(schema.validate('angry')).toBe(false);
    expect(schema.getErrors('angry').length).toBeGreaterThan(0);
    expect(typeof schema.typeId).toBe('string');
  });

  it('mock picks a member of the enum', () => {
    const value = schema.mock({mock: {seed: 3}});
    expect(moodEnum.enumValues).toContain(value);
  });
});
