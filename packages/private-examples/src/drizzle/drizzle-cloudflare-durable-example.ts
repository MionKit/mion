import {drizzle} from 'drizzle-orm/durable-sqlite';
import type {DrizzleSqliteDODatabase} from 'drizzle-orm/durable-sqlite';
import {toDrizzle} from '@mionjs/drizzle-orm-sqlite-core/drizzle';
import type {InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';
import {notes} from './drizzle-proxy-sqlite-example.ts';

export type Note = InferSelectModel<typeof notes>;
export type NewNote = InferInsertModel<typeof notes>;

const notesDb = toDrizzle(notes);

// the part of a Durable Object's storage drizzle needs
interface Storage {
  sql: {exec(query: string, ...bindings: unknown[]): unknown};
}

export class NotesObject {
  private readonly db: DrizzleSqliteDODatabase;

  constructor(storage: Storage) {
    this.db = drizzle(storage as never);
  }

  // same models, validators and table as every other database
  async addNote(note: NewNote): Promise<Note> {
    const [row] = await this.db.insert(notesDb).values(note).returning();
    return row as Note;
  }
}
