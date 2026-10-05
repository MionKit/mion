import {drizzle} from 'drizzle-orm/d1';
import {eq} from 'drizzle-orm';
import {toDrizzle} from '@mionjs/drizzle-orm-sqlite-core/drizzle';
import {notes, type Note} from './drizzle-proxy-sqlite-example.ts';

// built once
const notesDb = toDrizzle(notes);

// the database binding
interface Env {
  DB: Parameters<typeof drizzle>[0];
}

export async function findNote(
  env: Env,
  id: number
): Promise<Note | undefined> {
  const db = drizzle(env.DB);
  // the timestamp is already a Date
  const [note] = await db.select().from(notesDb).where(eq(notesDb.id, id));
  return note;
}
