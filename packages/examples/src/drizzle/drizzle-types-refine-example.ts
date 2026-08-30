// Refinement over the types road: tableFromType rebuilds the recorded table
// from the pure type, and refineTableType tightens it exactly as it does for
// a builder-declared table. Every function below is generated from the derived
// types by the standard runtypes API; none of it needs mion.
import * as DB from '@mionjs/drizzle-orm-pg-core';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {InferInsertModel, InferSelectModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import {createJsonDecoderFn, createJsonEncoderFn, createMockDataFn, createValidateFn} from '@ts-runtypes/core';

export type UsersTable = DB.PgTable<
  'users',
  {
    id: DB.Uuid<'id', {primaryKey: true; defaultRandom: true}>;
    name: DB.Varchar<'name', {length: 100; notNull: true}>; // captured as String<{maxLength: 100}>
    age: DB.Integer<'age', {notNull: true}>;
    createdAt: DB.Timestamp<'created_at', {mode: 'date'; notNull: true; defaultNow: true}>;
  }
>;
export const users = DB.tableFromType<UsersTable>();

// Same table object back, types tightened: the API asks for more than the DB.
export const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});

export type User = InferSelectModel<typeof apiUsers>; // name: String<{maxLength: 100, minLength: 10}>
export type NewUser = InferInsertModel<typeof apiUsers>; // id and createdAt optional (DB defaults)
export type UserPatch = InferUpdateModel<typeof apiUsers>; // any subset of the insert payload

// Validate, mock, serialize, deserialize: all compiled from the types.
export const validateUser = createValidateFn<User>();
export const mockUser = createMockDataFn<User>(); // realistic rows that pass validateUser
export const encodeUser = createJsonEncoderFn<User>();
export const decodeUser = createJsonDecoderFn<User>();

// The validator enforces the captured AND the refined bounds:
export const checks = [
  validateUser(mockUser()), // true: mock data respects every bound
  validateUser({...mockUser(), name: 'short'}), // false: refined minLength 10
  validateUser({...mockUser(), age: 17}), // false: refined min 18
];

// The serializer pair keeps createdAt a REAL Date across the JSON wire:
const wire = encodeUser(mockUser())!; // a JSON string, the Date made wire-safe
export const restored = decodeUser(wire); // restored.createdAt instanceof Date
