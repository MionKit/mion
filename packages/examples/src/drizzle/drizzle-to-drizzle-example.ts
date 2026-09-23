import {gte} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/pg-proxy';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {users, type User} from './drizzle-proxy-pg-example.ts';

// a genuine drizzle table, also what a drizzle-kit schema file exports
export const usersDb = toDrizzle(users);

// any drizzle driver works; swap in node-postgres, pglite or neon in a real app
const db = drizzle(async () => ({rows: []}));

export async function listAdults(): Promise<User[]> {
  // typed rows, formats intact: the same User the routes use
  return db.select().from(usersDb).where(gte(usersDb.age, 18));
}
