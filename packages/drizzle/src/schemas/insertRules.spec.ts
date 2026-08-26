/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Pins drizzle's insert/update optionality semantics (drizzle-orm operations.d.ts):
// required iff notNull && !hasDefault; columns with defaults / $defaultFn / $onUpdate
// optional; generated and identity-'always' columns absent from the payload entirely
// (flagged via hasUnknownKeys when sent anyway). Update = any subset of insert.

import {describe, it, expect} from 'vitest';
import {sql} from 'drizzle-orm';
import {integer, pgTable, text, timestamp, varchar} from 'drizzle-orm/pg-core';
import {createInsertSchema, createUpdateSchema} from './createSchemas.ts';

const products = pgTable('products', {
  // identity 'always': absent from the insert payload
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  // notNull without default: REQUIRED
  name: varchar('name', {length: 100}).notNull(),
  // nullable: optional
  description: text('description'),
  // notNull WITH default: optional
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // notNull with $defaultFn: optional
  slug: text('slug')
    .notNull()
    .$defaultFn(() => 'generated'),
  // notNull with $onUpdate: optional
  updatedAt: timestamp('updated_at', {mode: 'string'})
    .notNull()
    .$onUpdate(() => 'now'),
  // generated column: absent from the insert payload
  searchText: text('search_text').generatedAlwaysAs(sql`lower(name)`),
});

describe('createInsertSchema — optionality rules', () => {
  const schema = createInsertSchema(products);

  it('only notNull-without-default columns are required', () => {
    expect(schema.validate({name: 'a product'})).toBe(true);
    expect(schema.validate({})).toBe(false);
  });

  it('optional columns accept a value, null (when nullable), or absence', () => {
    expect(schema.validate({name: 'p', description: null})).toBe(true);
    expect(schema.validate({name: 'p', description: 'text'})).toBe(true);
    expect(schema.validate({name: 'p', createdAt: new Date(), slug: 'custom', updatedAt: '2026-01-01 00:00:00'})).toBe(true);
  });

  it('still rejects wrong types on optional columns', () => {
    expect(schema.validate({name: 'p', slug: 42})).toBe(false);
    expect(schema.validate({name: 42})).toBe(false);
  });

  it('identity-always and generated columns are absent: sending them flags unknown keys', () => {
    expect(schema.hasUnknownKeys({name: 'p', id: 5})).toBe(true);
    expect(schema.hasUnknownKeys({name: 'p', searchText: 'x'})).toBe(true);
    expect(schema.hasUnknownKeys({name: 'p'})).toBe(false);
    const errors = schema.unknownKeyErrors({name: 'p', id: 5});
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('createUpdateSchema — everything optional', () => {
  const schema = createUpdateSchema(products);

  it('accepts the empty object and any subset', () => {
    expect(schema.validate({})).toBe(true);
    expect(schema.validate({name: 'renamed'})).toBe(true);
    expect(schema.validate({description: null, slug: 'new-slug'})).toBe(true);
  });

  it('still rejects wrong types', () => {
    expect(schema.validate({name: 123})).toBe(false);
    expect(schema.validate({updatedAt: 42})).toBe(false);
  });
});
