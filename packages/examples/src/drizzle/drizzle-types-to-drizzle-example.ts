// The real drizzle table from a table written as a pure type: tableFromType
// already rebuilt the recorded table (in drizzle-types-pg-example.ts), and
// toDrizzle() replays it through drizzle itself exactly as on the builder
// road. This is the ONE place drizzle-orm runs.
import {gte} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/pg-proxy';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {usersRT, type User} from './drizzle-types-pg-example.ts';

// A genuine drizzle table: queries, relations, getTableConfig and drizzle-kit
// migrations all work on it. A drizzle-kit schema file just exports this.
export const users = toDrizzle(usersRT);

// Any drizzle driver works here; the callback driver keeps the example
// self-contained (swap in node-postgres, pglite, neon... in a real app).
const db = drizzle(async () => ({rows: []}));

export async function listAdults(): Promise<User[]> {
  // Fully typed rows with the formats intact: the same User the routes use.
  return db.select().from(users).where(gte(users.age, 18));
}
