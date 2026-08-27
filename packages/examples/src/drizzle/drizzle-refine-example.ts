// Tighten a table's types for the API without touching the SQL: refineTable
// returns the same table object with extra format params merged into the
// captured ones, and the standard runtypes functions compile validators and
// mocks straight from the derived model types.
import {pgTable, varchar, integer, refineTable} from '@mionjs/drizzle-orm-pg-core';
import type {InferInsert, InferSelect, InferUpdate} from '@mionjs/drizzle-orm-pg-core';
import {createMockDataFn, createValidateFn} from '@ts-runtypes/core';

export const users = pgTable('users', {
  name: varchar('name', {length: 100}).notNull(), // captured as String<{maxLength: 100}>
  age: integer('age').notNull(),
});

// Same table object back, types tightened: the API asks for more than the DB.
export const apiUsers = refineTable(users, {name: {minLength: 10}, age: {min: 18}});

// name: String<{maxLength: 100, minLength: 10}>, age min 18 included
export type User = InferSelect<typeof apiUsers>;
export type NewUser = InferInsert<typeof apiUsers>;
export type UserPatch = InferUpdate<typeof apiUsers>;

// Every function comes from the standard runtypes API over the derived types.
export const validateUser = createValidateFn<User>();
export const mockUser = createMockDataFn<User>();

export const checks = [
  validateUser({name: 'a long enough name', age: 30}), // true
  validateUser({name: 'short', age: 30}), // false: refined minLength 10
  validateUser({name: 'a long enough name', age: 17}), // false: refined min 18
];
