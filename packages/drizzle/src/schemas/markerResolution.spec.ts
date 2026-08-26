/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Task-0 risk gate for the schemas-from-tables feature, kept as a regression spec:
// proves the ts-runtypes scanner resolves the injection markers over computed
// generics (InferSelectModel<TTable> and friends) at a consumer call site where
// TTable is inferred from a real pgTable(...) value.

import {describe, it, expect} from 'vitest';
import {boolean, integer, pgEnum, pgTable, varchar} from 'drizzle-orm/pg-core';
import type {InferSelectModel} from 'drizzle-orm';
// Note: Must use regular import (not `import type`) for reflection to work
import {getRunTypeId} from '@ts-runtypes/core';
import {createEnumSchema, createInsertSchema, createSelectSchema, createUpdateSchema} from './createSchemas.ts';

const users = pgTable('users', {
  id: integer('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  isActive: boolean('is_active'),
});

const moodEnum = pgEnum('mood', ['happy', 'sad']);

describe('marker resolution over InferSelectModel<TTable> (task-0 spike)', () => {
  it('createSelectSchema resolves compiled fns and type id from a table value', () => {
    const schema = createSelectSchema(users);
    expect(typeof schema.typeId).toBe('string');
    expect(schema.typeId.length).toBeGreaterThan(0);
    expect(schema.validate({id: 1, name: 'ann', isActive: null})).toBe(true);
    expect(schema.validate({id: 1, name: 'ann', isActive: true})).toBe(true);
    // a real compiled validator rejects these; the identity fallback would not
    expect(schema.validate({id: 'nope', name: 'ann', isActive: null})).toBe(false);
    expect(schema.validate({id: 1, isActive: null})).toBe(false);
    const errors = schema.getErrors({id: 'nope', name: 'ann', isActive: null});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].path).toEqual(['id']);
  });

  // CLAUDE.md marker-coverage rule: both getRunTypeId call shapes resolve the
  // same id as the schema built from the table.
  it('static and reflection getRunTypeId shapes match schema.typeId', () => {
    const schema = createSelectSchema(users);
    const staticId = getRunTypeId<InferSelectModel<typeof users>>();
    const sampleRow: InferSelectModel<typeof users> = {id: 1, name: 'ann', isActive: null};
    const reflectedId = getRunTypeId(sampleRow);
    expect(staticId).toBe(schema.typeId);
    expect(reflectedId).toBe(schema.typeId);
  });

  it('createInsertSchema resolves over InferInsertModel (nullable optional, notNull required)', () => {
    const schema = createInsertSchema(users);
    expect(schema.validate({id: 1, name: 'ann'})).toBe(true);
    // id is notNull with no default: required in the insert payload
    expect(schema.validate({name: 'ann'})).toBe(false);
  });

  it('createUpdateSchema resolves over the InferUpdateModel alias (everything optional)', () => {
    const schema = createUpdateSchema(users);
    expect(schema.validate({})).toBe(true);
    expect(schema.validate({name: 'new name'})).toBe(true);
    expect(schema.validate({name: 123})).toBe(false);
  });

  it('createEnumSchema resolves over the enumValues union', () => {
    const schema = createEnumSchema(moodEnum);
    expect(schema.validate('happy')).toBe(true);
    expect(schema.validate('sad')).toBe(true);
    expect(schema.validate('angry')).toBe(false);
  });

  it('schema.mock generates rows accepted by the compiled validator', () => {
    const schema = createSelectSchema(users);
    const row = schema.mock();
    expect(schema.validate(row)).toBe(true);
  });
});
