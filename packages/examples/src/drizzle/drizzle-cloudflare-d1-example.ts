// Cloudflare D1: the same sqlite table, connected with drizzle-orm/d1.
// D1 is a driver, not a dialect, so nothing about the table changes.
import {drizzle} from 'drizzle-orm/d1';
import {eq} from 'drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-sqlite-core/drizzle';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {notes} from './drizzle-proxy-sqlite-example.ts';

export type Note = InferSelectModel<typeof notes>;

// The real drizzle table, built once from the recorded one.
const notesDb = toDrizzle(notes);

// Whatever your Worker's env binds the database to.
interface Env {
  DB: Parameters<typeof drizzle>[0];
}

export async function findNote(env: Env, id: number): Promise<Note | undefined> {
  const db = drizzle(env.DB);
  // Fully typed rows, with the timestamp column already a real Date.
  const [note] = await db.select().from(notesDb).where(eq(notesDb.id, id));
  return note;
}
