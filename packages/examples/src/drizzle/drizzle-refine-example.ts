// Tighten a table's types for the API without touching the SQL: refineTableType
// returns the same table object with extra format params merged into the
// captured ones. Every function below is generated from the derived types by
// the standard runtypes API; none of it needs mion.
import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {
  InferInsertModel,
  InferSelectModel,
  InferUpdateModel,
} from '@mionjs/drizzle-orm';
import {
  createJsonDecoderFn,
  createJsonEncoderFn,
  createMockDataFn,
  createValidateFn,
} from '@mionjs/run-types';

// A recorded table, NOT drizzle's PgTable type: toDrizzle() builds that on demand.
export const users = DZ.pgTable('users', {
  id: DZ.uuid('id').primaryKey().defaultRandom(),
  name: DZ.varchar('name', {length: 100}).notNull(), // captured as String<{maxLength: 100}>
  age: DZ.integer('age').notNull(),
  createdAt: DZ.timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});

// Same table object back, types tightened: the API asks for more than the DB.
export const apiUsers = refineTableType(users, {
  name: {minLength: 10},
  age: {min: 18},
});

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
