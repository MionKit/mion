import * as DZ from '@mionjs/drizzle-orm-pg-core';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {createValidateFn} from '@mionjs/run-types';

// nothing runs where the table is declared
export type UsersTable = DZ.PgTable<
  'users',
  {
    id: DZ.Uuid<'id', {primaryKey: true}>;
    name: DZ.Varchar<'name', {length: 100; notNull: true}>;
    age: DZ.Integer<'age', {notNull: true}>;
    role: DZ.Text<'role', {enum: ['admin', 'user']; notNull: true}>;
    createdAt: DZ.Timestamp<'created_at', {defaultNow: true; notNull: true}>;
  }
>;

// the same object pgTable returns; the build resolves the type, nothing is repeated
export const users = DZ.tableFromType<UsersTable>();

// identical to the builders model, formats included
export type User = InferSelectModel<UsersTable>;

// checks every captured param, with no extra runtime checks
export const validateUser = createValidateFn<User>();

export const checks = [
  validateUser({
    id: 'not-a-uuid',
    name: 'ann',
    age: 30,
    role: 'admin',
    createdAt: new Date(),
  }), // false
  validateUser({
    id: '793aff46-42ac-4372-b7fa-c48ba48ed94f',
    name: 'x'.repeat(101), // false: maxLength 100 is IN the compiled function
    age: 30,
    role: 'admin',
    createdAt: new Date(),
  }),
];
