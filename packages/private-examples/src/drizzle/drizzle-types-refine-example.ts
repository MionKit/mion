import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';
import {
  createJsonDecoderFn,
  createJsonEncoderFn,
  createValidateFn,
} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';

export type UsersTable = DZ.PgTable<
  'users',
  {
    id: DZ.Uuid<{primaryKey: true; defaultRandom: true}>;
    name: DZ.Varchar<{length: 100; notNull: true}>; // captured as String<{maxLength: 100}>
    age: DZ.Integer<{notNull: true}>;
    createdAt: DZ.Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>;
  },
  [],
  {createdAt: 'created_at'}
>;
export const users = DZ.tableFromType<UsersTable>();

// stricter types for the API
export const apiUsers = refineTableType(users, {
  name: {minLength: 10},
  age: {min: 18},
});

export type User = InferSelectModel<typeof apiUsers>; // name: String<{maxLength: 100, minLength: 10}>
export type NewUser = InferInsertModel<typeof apiUsers>; // id and createdAt optional (DB defaults)
export type UserPatch = Partial<InferInsertModel<typeof apiUsers>>;

export const validateUser = createValidateFn<User>();
export const mockUser = createMockDataFn<User>(); // realistic rows that pass validateUser
export const encodeUser = createJsonEncoderFn<User>();
export const decodeUser = createJsonDecoderFn<User>();

// checks the captured AND the refined bounds
export const checks = [
  validateUser(mockUser()), // true: mock data respects every bound
  validateUser({...mockUser(), name: 'short'}), // false: refined minLength 10
  validateUser({...mockUser(), age: 17}), // false: refined min 18
];

const wire = encodeUser(mockUser())!; // a JSON string, the Date made wire-safe
export const restored = decodeUser(wire); // restored.createdAt instanceof Date
