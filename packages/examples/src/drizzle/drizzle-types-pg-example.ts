// Types-first workflow: the SAME users table as drizzle-proxy-pg-example.ts,
// written as a pure type instead of builder calls. A column type takes the db
// name and ONE object holding the builder's config and its modifier calls, so
// Varchar<'name', {length: 100; notNull: true}> matches
// varchar('name', {length: 100}).notNull().
import * as DB from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

// The whole table is a type: nothing runs where it is declared.
export type UsersTable = DB.PgTable<
  'users',
  {
    id: DB.Uuid<'id', {primaryKey: true}>;
    name: DB.Varchar<'name', {length: 100; notNull: true}>;
    age: DB.Integer<'age', {notNull: true}>;
    role: DB.Text<'role', {enum: ['admin', 'user']; notNull: true}>;
    createdAt: DB.Timestamp<'created_at', {defaultNow: true; notNull: true}>;
  }
>;

// The recorded table back from the type: the same object pgTable returns, so
// toDrizzle, drizzle-kit and refineTableType work on it unchanged. The build
// resolves the type argument, so nothing is repeated and nothing else is
// imported.
export const users = DB.tableFromType<UsersTable>();

// The inferred model is identical to the builder road, formats included, and
// carries the exact same runtype id.
export type User = InferSelectModel<UsersTable>;

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
