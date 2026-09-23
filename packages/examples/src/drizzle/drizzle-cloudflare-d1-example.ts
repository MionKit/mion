import {drizzle} from 'drizzle-orm/d1';
import {eq} from 'drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-sqlite-core/drizzle';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {notes} from './drizzle-proxy-sqlite-example.ts';

export type Note = InferSelectModel<typeof notes>;

// the real drizzle table, built once
const notesDb = toDrizzle(notes);

// whatever your Worker's env binds the database to
interface Env {
  DB: Parameters<typeof drizzle>[0];
}

export async function findNote(
  env: Env,
  id: number
): Promise<Note | undefined> {
  const db = drizzle(env.DB);
  // typed rows, the timestamp column already a real Date
  const [note] = await db.select().from(notesDb).where(eq(notesDb.id, id));
  return note;
}
