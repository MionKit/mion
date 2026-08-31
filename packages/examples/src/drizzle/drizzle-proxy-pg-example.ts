// Tables-first workflow: the column builders come from @mionjs/drizzle-orm-pg-core
// instead of drizzle-orm/pg-core. Same names, same params, same modifier chains.
import * as DB from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

// A recorded table, NOT drizzle's PgTable type: DB.pgTable records the calls,
// and toDrizzle() builds the real drizzle table from them on demand.
export const users = DB.pgTable('users', {
  id: DB.uuid('id').primaryKey(),
  name: DB.varchar('name', {length: 100}).notNull(),
  age: DB.integer('age').notNull(),
  role: DB.text('role', {enum: ['admin', 'user']}).notNull(),
  createdAt: DB.timestamp('created_at').defaultNow().notNull(),
});

// The inferred model carries format types, not plain string/number:
// { id: UUID; name: String<{maxLength: 100}>; age: Int32; role: 'admin' | 'user'; createdAt: Date }
export type User = InferSelectModel<typeof users>;

// The compiled validator enforces every captured param with no runtime guards
export const validateUser = createValidateFn<User>();

export const checks = [
  validateUser({id: 'not-a-uuid', name: 'ann', age: 30, role: 'admin', createdAt: new Date()}), // false
  validateUser({
    id: '793aff46-42ac-4372-b7fa-c48ba48ed94f',
    name: 'x'.repeat(101), // false: maxLength 100 is IN the compiled function
    age: 30,
    role: 'admin',
    createdAt: new Date(),
  }),
];
