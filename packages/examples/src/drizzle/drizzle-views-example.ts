// A view you declare with explicit columns is recorded like a table, so its
// row type travels through your app the same way. Views are read only: they
// get InferSelectViewModel, never an insert or update model.
import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectViewModel} from '@mionjs/drizzle-orm';
import {sql} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';
import {users} from './drizzle-proxy-pg-example.ts';

// The columns are yours to declare, and the query is plain sql. Embedded
// tables resolve to the real drizzle tables when the view materializes.
export const adultUsers = DZ.pgView('adult_users', {
  id: DZ.uuid('id'),
  name: DZ.varchar('name', {length: 100}).notNull(),
  role: DZ.text('role', {enum: ['admin', 'user']}).notNull(),
}).as(sql`select id, name, role from ${users} where age >= 18`);

// A view that already exists in the database. drizzle-kit will not try to
// create it, but you still get the row type.
export const legacyUsers = DZ.pgView('legacy_users', {
  id: DZ.uuid('id'),
  name: DZ.varchar('name', {length: 100}),
}).existing();

// The row type of a view, with the same format types a table gives you:
// { id: UUID | null; name: String<{maxLength: 100}>; role: 'admin' | 'user' }
export type AdultUser = InferSelectViewModel<typeof adultUsers>;

export const validateAdultUser = createValidateFn<AdultUser>();

export const checks = [
  validateAdultUser({id: '793aff46-42ac-4372-b7fa-c48ba48ed94f', name: 'ann', role: 'admin'}), // true
  validateAdultUser({id: null, name: 'x'.repeat(101), role: 'admin'}), // false: maxLength 100
];
