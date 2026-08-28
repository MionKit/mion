// Tables-first workflow: import the column builders from @mionjs/drizzle-orm-pg-core
// instead of drizzle-orm/pg-core. Same names, same params, same runtime.
import {pgTable, uuid, varchar, integer, text, timestamp} from '@mionjs/drizzle-orm-pg-core';
import type {InferSelect} from '@mionjs/drizzle-orm-pg-core';
import {createValidateFn} from '@ts-runtypes/core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  role: text('role', {enum: ['admin', 'user']}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// The inferred model carries format types, not plain string/number:
// { id: UUID; name: String<{maxLength: 100}>; age: Int32; role: 'admin' | 'user'; createdAt: Date }
export type User = InferSelect<typeof users>;

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
