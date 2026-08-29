// The real drizzle table straight from the table TYPE: toDrizzle<UsersTable>()
// is the happy path for query and migration files. Only the type is imported,
// so this file loads no code from the schema file, and the result is the same
// memoized drizzle table the rest of the app shares. This is the ONE place
// drizzle-orm runs.
import {gte} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/pg-proxy';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import type {UsersTable, User} from './drizzle-types-pg-example.ts';

// A genuine drizzle table: queries, relations, getTableConfig and drizzle-kit
// migrations all work on it. A drizzle-kit schema file just exports this.
export const usersDb = toDrizzle<UsersTable>();

// Any drizzle driver works here; the callback driver keeps the example
// self-contained (swap in node-postgres, pglite, neon... in a real app).
const db = drizzle(async () => ({rows: []}));

export async function listAdults(): Promise<User[]> {
  // Fully typed rows with the formats intact: the same User the routes use.
  return db.select().from(usersDb).where(gte(usersDb.age, 18));
}
