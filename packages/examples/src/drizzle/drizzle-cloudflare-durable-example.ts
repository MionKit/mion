// Durable Objects SQLite: the same sqlite table again, this time connected with
// drizzle-orm/durable-sqlite inside the object.
import {drizzle} from 'drizzle-orm/durable-sqlite';
import type {DrizzleSqliteDODatabase} from 'drizzle-orm/durable-sqlite';
import {toDrizzle} from '@mionjs/drizzle-orm-sqlite-core/drizzle';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';
import {notes} from './drizzle-proxy-sqlite-example.ts';

export type Note = InferSelectModel<typeof notes>;
export type NewNote = InferInsertModel<typeof notes>;

const notesDb = toDrizzle(notes);

// The storage a Durable Object hands you, as much of it as drizzle needs.
interface Storage {
  sql: {exec(query: string, ...bindings: unknown[]): unknown};
}

export class NotesObject {
  private readonly db: DrizzleSqliteDODatabase;

  constructor(storage: Storage) {
    this.db = drizzle(storage as never);
  }

  // Same models, same validators, same table as every other database.
  async addNote(note: NewNote): Promise<Note> {
    const [row] = await this.db.insert(notesDb).values(note).returning();
    return row as Note;
  }
}
