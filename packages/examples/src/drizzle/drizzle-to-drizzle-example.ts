// The real drizzle table, on demand: toDrizzle() replays the recorded calls
// through drizzle itself and memoizes the result (every call returns the same
// object). This is the ONE place drizzle-orm runs, so it is only needed where
// you query or migrate; routes and clients never load it.
import {gte} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/pg-proxy';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {users, type User} from './drizzle-proxy-pg-example.ts';

// A genuine drizzle table: queries, relations, getTableConfig and drizzle-kit
// migrations all work on it. A drizzle-kit schema file just exports this.
export const usersDb = toDrizzle(users);

// Any drizzle driver works here; the callback driver keeps the example
// self-contained (swap in node-postgres, pglite, neon... in a real app).
const db = drizzle(async () => ({rows: []}));

export async function listAdults(): Promise<User[]> {
  // Fully typed rows with the formats intact: the same User the routes use.
  return db.select().from(usersDb).where(gte(usersDb.age, 18));
}
